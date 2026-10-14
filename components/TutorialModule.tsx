import React, { useState, useMemo } from 'react';
import { ModuleType } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  onSelectModule?: (module: ModuleType, tab?: any) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

type RoleType = 'LEADER' | 'CASHIER' | 'STORE_KEEPER' | 'CHECKLIST' | 'SIMULATOR_WA';

export const TutorialModule: React.FC<Props> = ({ onSelectModule, showToast }) => {
  const [activeRole, setActiveRole] = useState<RoleType>('LEADER');
  const [searchQuery, setSearchQuery] = useState('');
  const [completedChecklist, setCompletedChecklist] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('tutorial_completed_checklist');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleChecklist = (id: string) => {
    const next = { ...completedChecklist, [id]: !completedChecklist[id] };
    setCompletedChecklist(next);
    try {
      localStorage.setItem('tutorial_completed_checklist', JSON.stringify(next));
    } catch (e) {
      console.warn('Failed to save checklist:', e);
    }
  };

  // Sample WA text generator demo
  const [demoOutlet, setDemoOutlet] = useState('SH THE BARN');
  const [demoDate, setDemoDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [demoLunchRev, setDemoLunchRev] = useState(12500000);
  const [demoLunchCover, setDemoLunchCover] = useState(48);
  const [demoDinnerRev, setDemoDinnerRev] = useState(18200000);
  const [demoDinnerCover, setDemoDinnerCover] = useState(72);
  const [demoDiscount, setDemoDiscount] = useState(1500000);
  const [demoGrab, setDemoGrab] = useState(850000);
  const [demoGofood, setDemoGofood] = useState(620000);

  const demoWATemplate = useMemo(() => {
    const totalRev = demoLunchRev + demoDinnerRev;
    const totalCover = demoLunchCover + demoDinnerCover;
    const formatIDR = (n: number) => n.toLocaleString('id-ID');

    return `*LUNCH & DINNER - REVENUE REPORT*
*${demoOutlet}*
*Date: ${new Date(demoDate).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}*

*1. LUNCH REVENUE*
- Total Revenue : Rp ${formatIDR(demoLunchRev)}
- Total Covers  : ${demoLunchCover} Pax
- Avg Check     : Rp ${demoLunchCover > 0 ? formatIDR(Math.round(demoLunchRev / demoLunchCover)) : 0}

*2. DINNER REVENUE*
- Total Revenue : Rp ${formatIDR(demoDinnerRev)}
- Total Covers  : ${demoDinnerCover} Pax
- Avg Check     : Rp ${demoDinnerCover > 0 ? formatIDR(Math.round(demoDinnerRev / demoDinnerCover)) : 0}

*3. SUMMARY HARIAN*
- Total Sales   : Rp ${formatIDR(totalRev)}
- Total Covers  : ${totalCover} Pax
- Total Disc    : Rp ${formatIDR(demoDiscount)}
- GrabFood      : Rp ${formatIDR(demoGrab)}
- GoFood        : Rp ${formatIDR(demoGofood)}

_Generated automatically via Outlet Performance System_`;
  }, [demoOutlet, demoDate, demoLunchRev, demoLunchCover, demoDinnerRev, demoDinnerCover, demoDiscount, demoGrab, demoGofood]);

  const handleCopyDemo = () => {
    navigator.clipboard.writeText(demoWATemplate).then(() => {
      showToast?.('Contoh Template WA berhasil disalin ke Clipboard!', 'success');
    }).catch(() => {
      showToast?.('Gagal menyalin text template', 'error');
    });
  };

  const leaderSteps = [
    {
      id: 'l1',
      title: '1. Input Budget Revenue & Target Harian di Admin Control',
      badge: 'Admin Control (Revenue & Target)',
      badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
      icon: 'fa-sliders-h',
      iconColor: 'from-indigo-600 to-purple-700',
      moduleLink: ModuleType.ADMIN,
      moduleName: 'Buka Admin Control',
      summary: 'Input Budget Revenue bulanan dan Target Harian diakses di menu Admin Control (tab Revenue & Targets).',
      points: [
        { 
          label: 'Diakses di Admin Control (Revenue & Target)', 
          isHighlight: true,
          desc: 'Leader (Store Manager / SPV / MOD) mengakses menu Admin Control pada tab "Revenue & Targets" untuk menginput target omzet outlet.' 
        },
        { 
          label: 'Leader Wajib Input Budget Revenue Setiap Bulan', 
          desc: 'Wajib diinput setiap awal bulan baru sebagai target acuan resmi RKAP bulanan outlet.' 
        },
        { 
          label: 'Leader Wajib Input Target Harian yang di-Share di Group Setiap Hari', 
          isHighlight: true,
          desc: 'Wajib memasukkan angka Target Harian yang dibagikan (di-share) di grup WhatsApp operasional setiap hari (Weekday/Weekend/Holiday).' 
        },
        { 
          label: 'Tujuan Penginputan', 
          desc: 'Memudahkan pada saat penginputan angka pada nominal revenue analisa dan bisa dilihat langsung di fitur Rekapan Harian.' 
        }
      ],
      notes: '⚠️ Lakukan penginputan target harian di pagi hari sebelum shift opening / operasional lunch dimulai.'
    },
    {
      id: 'l2',
      title: '2. Leader Wajib Input Opening Inventory di Fitur COGS',
      badge: 'Opening Inventory (Awal Bulan)',
      badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      icon: 'fa-boxes-stacked',
      iconColor: 'from-purple-600 to-pink-700',
      moduleLink: ModuleType.COGS,
      moduleName: 'Buka Fitur COGS',
      summary: 'Leader WAJIB input Opening Inventory (Ending akhir bulan di bulan sebelumnya) pada fitur COGS.',
      points: [
        { 
          label: 'Opening Inventory = Ending Akhir Bulan Sebelumnya', 
          isHighlight: true,
          desc: 'Leader wajib memasukkan nominal stok awal bulan (Opening Inventory) yang nilainya diambil persis dari stok ending akhir bulan pada bulan sebelumnya.' 
        },
        { 
          label: 'Dasar Perhitungan COGS / HPP Aktual', 
          desc: 'Nilai Opening Inventory menjadi pondasi perhitungan HPP aktual: COGS = Opening Inventory (+) + Actual Belanja MTD (Receiving Sheet) (-) Closing Inventory.' 
        },
        { 
          label: 'Input & Submit di Fitur COGS', 
          desc: 'Buka fitur COGS, masukkan nominal pada bagian "1. OPENING INVENTORY (+)" lalu klik simpan/submit agar tersimpan permanen di database.' 
        }
      ],
      notes: '⚠️ Input Opening Inventory di awal bulan baru setelah proses Stock Opname / Ending Inventory bulan lalu final.'
    },
    {
      id: 'l3',
      title: '3. Controlling Belanja & Forecast Revenue di Fitur COGS',
      badge: 'Controlling Belanja & Forecast',
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      icon: 'fa-chart-pie',
      iconColor: 'from-cyan-600 to-blue-700',
      moduleLink: ModuleType.COGS,
      moduleName: 'Buka Fitur COGS',
      summary: 'Controlling belanja dan Forecast Revenue tersedia dan dipantau langsung di fitur COGS.',
      points: [
        { 
          label: 'Controlling Belanja Harian & MTD', 
          isHighlight: true,
          desc: 'Memantau akumulasi belanja bahan baku harian (Receiving Sheet, MS, MK, Supplier) terhadap budget belanja agar tidak over-budget.' 
        },
        { 
          label: 'Forecast Revenue (Proyeksi Akhir Bulan)', 
          isHighlight: true,
          desc: 'Melihat estimasi pencapaian omzet akhir bulan berdasarkan tren dan laju penjualan (run rate) aktual bulan berjalan.' 
        },
        { 
          label: 'Sisa Alokasi Belanja (Purchasing Power)', 
          desc: 'Mengetahui sisa budget belanja yang diizinkan untuk sisa hari berjalan demi menjaga rasio HPP tetap pada batas aman.' 
        }
      ],
      notes: '💡 Fitur COGS menjadi instrumen utama Leader dalam mengendalikan biaya bahan baku dan memproyeksikan performa finansial.'
    },
    {
      id: 'l4',
      title: '4. Input Budget Cat Cost di Fitur Receiving Sheet',
      badge: 'Budget Cat Cost (5% COGS)',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      icon: 'fa-tags',
      iconColor: 'from-amber-500 to-orange-600',
      moduleLink: ModuleType.RECEIVING_SHEET,
      moduleName: 'Buka Receiving Sheet',
      summary: 'Apabila Leader ingin melihat Budget Cat Cost, silahkan input nominal angka sesuai kategori yang biasa di-input di Excel dan masukkan nominalnya di fitur Receiving Sheet.',
      points: [
        { 
          label: 'Input Nominal Sesuai Kategori Excel', 
          isHighlight: true,
          desc: 'Apabila Leader ingin melihat Budget Cat Cost, silahkan input nominal angka sesuai kategori yang biasa di-input di Excel dan masukkan nominalnya di fitur Receiving Sheet.' 
        },
        { 
          label: '4 Kategori Biaya (Guest Supplies, Spoiled, Waste, Non Commodity)', 
          desc: 'Kategori cost mencakup Guest Supplies (1%), Spoiled (0.5%), Waste (2.5%), dan Non Commodity (1.0%) dari COGS Aktual.' 
        },
        { 
          label: 'Analisa Selisih & Efisiensi Otomatis', 
          desc: 'Sistem otomatis membandingkan budget vs realisasi actual, menghitung selisih nominal rupiah, serta menampilkan status EFISIEN / HEMAT vs OVER BUDGET.' 
        }
      ],
      notes: '💡 Klik tombol "Input / Edit Realisasi Cat Cost" di tabel Budget Category Cost pada halaman Receiving Sheet untuk memasukkan angka.'
    },
    {
      id: 'l5',
      title: '5. Monitoring Revenue Analisa di Rekapan Harian',
      badge: 'Revenue Analisa & Rekapan Harian',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      icon: 'fa-chart-line',
      iconColor: 'from-emerald-600 to-teal-700',
      moduleLink: ModuleType.REKAPAN,
      moduleName: 'Buka Rekapan Harian',
      summary: 'Tujuan sinkronisasi data target dan COGS oleh Leader:',
      points: [
        { 
          label: 'Memudahkan Penginputan Revenue Analisa', 
          isHighlight: true,
          desc: 'Memudahkan pada saat penginputan angka pada nominal revenue analisa dan perhitungan persentase pencapaian serta selisih target vs omzet aktual.' 
        },
        { 
          label: 'Dapat Dipantau Langsung di Fitur Rekapan Harian', 
          desc: 'Seluruh data perbandingan target vs aktual, gap revenue, rasio cover, dan performa MTD otomatis tersaji rapi dan bisa dilihat di fitur Rekapan Harian oleh seluruh tim dan manajemen regional.' 
        }
      ],
      notes: '💡 Sinkronisasi target dan inventory yang disiplin memastikan laporan analisa harian selalu akurat dan siap dipresentasikan.'
    }
  ];

  const cashierSteps = [
    {
      id: 'c1',
      title: '1. Input Guest Satisfaction Terlebih Dahulu (Wajib Sebelum Daily Revenue)',
      badge: '⚠️ Wajib Di-input Pertama',
      badgeColor: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
      icon: 'fa-face-smile',
      iconColor: 'from-teal-600 to-emerald-700',
      moduleLink: ModuleType.GUEST_SATISFACTION,
      moduleName: 'Buka Guest Satisfaction',
      summary: 'Input Guest Satisfaction WAJIB di-input terlebih dahulu sebelum kasir menginput nominal revenue di fitur Daily Revenue.',
      points: [
        { 
          label: 'Wajib Di-input Terlebih Dahulu', 
          isHighlight: true,
          desc: 'Jika ada komplain tamu atau menu pengganti (diskon kompensasi 100%), kasir WAJIB menginput data Guest Satisfaction terlebih dahulu sebelum masuk ke Daily Revenue.' 
        },
        { 
          label: 'Sinkronisasi Analisa Revenue', 
          desc: 'Hal ini bertujuan agar data kompensasi, potongan diskon 100%, dan perhitungan revenue bersih pada sistem analisa tercatat secara tepat dan tidak ada selisih.' 
        },
        { 
          label: 'Rincian Input', 
          desc: 'Masukkan Nama Product, Harga After Discount (100%), Nama PIC yang menangani, dan Kronologi/Alasan komplain sesuai tanggal kejadian.' 
        }
      ],
      notes: '⚠️ SOP MUTLAK: Input Guest Satisfaction terlebih dahulu sebelum menginput omzet di Daily Revenue!'
    },
    {
      id: 'c2',
      title: '2. Daily Revenue Harian pada Fitur Daily Revenue',
      badge: 'Wajib Setiap Shift',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      icon: 'fa-cash-register',
      iconColor: 'from-emerald-600 to-teal-700',
      moduleLink: ModuleType.SALES,
      moduleName: 'Buka Daily Revenue',
      summary: 'Setelah Guest Satisfaction dicek/diinput, lanjutkan input omzet penjualan Lunch & Dinner, jumlah tamu (Cover), diskon promosi, dan online delivery.',
      points: [
        { label: 'Revenue Lunch & Dinner', desc: 'Input nominal total pendapatan sesi Lunch dan sesi Dinner (Dine In & Take Away).' },
        { label: 'Cover (Pax)', desc: 'Input total jumlah tamu / pengunjung yang bertransaksi pada sesi makan.' },
        { label: 'Discount', desc: 'Input rincian diskon: Banking Promo (Bank Mega, BCA, dll), Membership, Investor, Voucher, dll.' },
        { label: 'Online Food', desc: 'Input pendapatan dari order online seperti GrabFood, GoFood, dan ShopeeFood.' },
        { 
          label: '⚡ COPY TEMPLATE WA REPORT', 
          isHighlight: true,
          desc: 'Tersedia tombol otomatis "Copy Lunch", "Copy Dinner", dan "Copy Closing" setelah data di-submit. Kasir TIDAK PERLU lagi mengetik ulang format laporan ke WhatsApp!' 
        }
      ],
      notes: 'Pastikan klik "SIMPAN REVENUE" setelah selesai input sesi lunch maupun closing dinner.'
    },
    {
      id: 'c3',
      title: '3. Input Patty Cash Expense (Hanya Kasir Sesuai Bon Pembelanjaan)',
      badge: 'Pengeluaran Kas Operasional',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      icon: 'fa-wallet',
      iconColor: 'from-amber-500 to-orange-600',
      moduleLink: ModuleType.PATTY_CASH_EXPENSE,
      moduleName: 'Buka Patty Cash Expense',
      summary: 'PENGINPUTAN CASH HANYA DI-INPUT OLEH CASHIER SESUAI BON PEMBELANJAAN.',
      points: [
        { 
          label: 'Wewenang Khusus Kasir', 
          isHighlight: true,
          desc: 'Store Keeper atau staf divisi lain TIDAK menginput kas/cash. Segala pengeluaran uang tunai / petty cash hanya boleh diinput oleh Kasir berdasarkan bon pembelanjaan fisik yang sah.' 
        },
        { label: 'Kategori Pengeluaran', desc: 'Pilih kategori yang sesuai (misal: Supplies, Operasional, Transport, Urgent Kitchen/Bar/Service).' },
        { label: 'Tanggal Pengeluaran & Nominal', desc: 'Pilih tanggal aktual saat uang kas kecil dikeluarkan dan masukkan nominal sesuai bon/nota fisik.' }
      ],
      notes: 'Nota fisik petty cash harus tetap disimpan dan diarsipkan rapi oleh kasir.'
    },
    {
      id: 'c4',
      title: '4. Input City Ledger (Jika Ada Transaksi Piutang/Tagihan)',
      badge: 'Piutang & Tagihan',
      badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      icon: 'fa-building',
      iconColor: 'from-blue-600 to-indigo-700',
      moduleLink: ModuleType.CITY_LEDGER,
      moduleName: 'Buka City Ledger',
      summary: 'Input transaksi tagihan City Ledger jika ada pada tanggal bersangkutan dan jelaskan penyebabnya.',
      points: [
        { label: 'Nama Product', desc: 'Nama menu / produk yang dipesan tamu pada tagihan City Ledger.' },
        { label: 'Harga / Nominal', desc: 'Total tagihan rupiah yang menjadi City Ledger.' },
        { label: 'PIC (Petugas)', desc: 'Nama kasir / staf penanggung jawab transaksi tersebut.' },
        { label: 'Catatan / Pelaku / Keterangan', desc: 'Tuliskan nama instansi/pelaku atau alasan timbulnya transaksi City Ledger.' }
      ],
      notes: '⚠️ PASTIKAN PENGINPUTAN SESUAI TANGGAL KEJADIAN! Pilih tombol tanggal yang tersedia pada halaman City Ledger.'
    }
  ];

  const storeKeeperSteps = [
    {
      id: 'sk1',
      title: '1. Input Belanja Sesuai Barang yang di-GR (Good Receipt)',
      badge: 'Aturan Good Receipt (GR)',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      icon: 'fa-truck-ramp-box',
      iconColor: 'from-emerald-600 to-teal-700',
      moduleLink: ModuleType.MAIN_STORE_KITCHEN,
      moduleName: 'Buka Main Store & Kitchen',
      summary: 'Belanja yang di-input WAJIB SESUAI DENGAN BARANG YANG DI-GR (Good Receipt / kedatangan fisik barang yang diterima di outlet), BUKAN KETIKA MENAIKKAN RO (Requisition Order).',
      points: [
        { 
          label: 'Prinsip Good Receipt (GR)', 
          isHighlight: true,
          desc: 'Input data belanja dilakukan saat barang fisik telah tiba di outlet, diperiksa fisiknya, dan diverifikasi melalui form Good Receipt / Surat Jalan penerimaan barang.' 
        },
        { 
          label: 'Bukan Saat Menaikkan RO', 
          desc: 'Saat menaikkan RO adalah estimasi pemesanan awal. Pencatatan resmi belanja di sistem baru dilakukan saat barang sudah resmi diterima (di-GR) agar nilai HPP dan stok fisik selalu sinkron 100%.' 
        }
      ],
      notes: '⚠️ PASTIKAN MENGINPUT SESUAI TANGGAL PENERIMAAN BARANG (GR) DENGAN NOMINAL AKTUAL YANG DITERIMA!'
    },
    {
      id: 'sk2',
      title: '2. Penginputan Cash Hanya Di-input oleh Cashier Sesuai Bon Pembelanjaan',
      badge: 'Aturan Pengeluaran Cash',
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      icon: 'fa-hand-holding-usd',
      iconColor: 'from-rose-600 to-red-700',
      moduleLink: ModuleType.PATTY_CASH_EXPENSE,
      moduleName: 'Lihat Patty Cash',
      summary: 'PENGINPUTAN CASH HANYA DI-INPUT OLEH CASHIER SESUAI BON PEMBELANJAAN.',
      points: [
        { 
          label: 'Store Keeper Tidak Menginput Cash', 
          isHighlight: true,
          desc: 'Store Keeper TIDAK melakukan penginputan kas/cash pengeluaran. Seluruh pengeluaran tunai (cash/petty cash) HANYA diinput oleh Cashier di modul Patty Cash Expense.' 
        },
        { 
          label: 'Serahkan Bon Belanja ke Kasir', 
          desc: 'Jika ada belanja lokal/pasar yang menggunakan uang kas kecil, serahkan bon/nota belanja fisik yang valid kepada Kasir untuk diinput.' 
        }
      ],
      notes: '⚠️ Store Keeper fokus pada penerimaan barang fisik (GR), Main Store, Main Kitchen, dan Supplier Expense.'
    },
    {
      id: 'sk3',
      title: '3. Total Belanja Main Store Otomatis Dikurangi Chemical, Stationary & Marketing',
      badge: 'Otomatisasi Potongan Biaya',
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      icon: 'fa-calculator',
      iconColor: 'from-cyan-500 to-blue-600',
      moduleLink: ModuleType.CHEMICAL,
      moduleName: 'Buka Chemical, Stationary & Marketing',
      summary: 'Setiap item Chemical, Stationary (ATK/Kertas Kasir), dan Marketing yang diinput akan secara OTOMATIS MENGURANGI total belanja Main Store pada tanggal yang bersangkutan.',
      points: [
        { 
          label: 'Formula Pengurangan Otomatis', 
          desc: 'Total Belanja Bersih MS = Total Nota MS - (Total Chemical + Total Stationary + Total Marketing).' 
        },
        { 
          label: 'Fitur Chemical, Stationary & Marketing', 
          desc: 'Tersedia kategori Chemical (Pembersih/Cleaning), Stationary (ATK/Kertas Kasir/Nota), dan Marketing (Brosur/Tent Card/Promo) pada modul Chemical.' 
        }
      ],
      notes: 'Sistem otomatis memotong belanja Main Store setiap tanggalnya, Store Keeper tidak perlu lagi menghitung pengurangan secara manual.'
    },
    {
      id: 'sk4',
      title: '4. Input Sederhana: Cukup Nama Supplier / MS / MK',
      badge: 'Input Cepat & Praktis',
      badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
      icon: 'fa-truck-loading',
      iconColor: 'from-indigo-600 to-blue-700',
      moduleLink: ModuleType.SUPPLIER_EXPENSE,
      moduleName: 'Buka Supplier Expense',
      summary: 'Tidak perlu mengetik puluhan item rincian kecil satu per satu jika memakai total belanja.',
      points: [
        { label: 'Belanja Supplier Rekanan', desc: 'Cukup masukkan Nama Supplier dan total nominal belanja pada nota supplier yang di-GR.' },
        { label: 'Belanja MS & MK', desc: 'Cukup masukkan total nominal dari Main Store dan Main Kitchen sesuai penerimaan barang (GR).' }
      ],
      notes: 'Mempercepat proses input data Store Keeper setiap hari tanpa mengurangi keakuratan laporan.'
    },
    {
      id: 'sk5',
      title: '5. Semua Fitur Input Tersedia Langsung di Dashboard',
      badge: 'Kemudahan Akses',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      icon: 'fa-th-large',
      iconColor: 'from-emerald-600 to-teal-800',
      moduleLink: ModuleType.DASHBOARD,
      moduleName: 'Kembali ke Dashboard',
      summary: 'Semua tombol navigasi modul sudah terpasang rapi di Dashboard Beranda.',
      points: [
        { label: 'Navigasi 1-Klik', desc: 'Klik kartu di Dashboard untuk langsung membuka Receiving Sheet, MS & MK, Supplier, Chemical & Supplies, atau Patty Cash.' }
      ],
      notes: 'Gunakan Sidebar samping jika sedang berada di dalam modul lain untuk berpindah cepat.'
    }
  ];

  const checklistItems = [
    // Leader Checklists
    { id: 'chk_l1', role: 'LEADER', title: 'Input Budget & Target Harian di Admin Control', desc: 'Diakses di Admin Control (Revenue & Target): wajib input budget bulanan & target harian dari share group' },
    { id: 'chk_l2', role: 'LEADER', title: 'Input Opening Inventory di Fitur COGS', desc: 'Leader wajib input Opening Inventory (Ending akhir bulan di bulan sebelumnya) di fitur COGS pada awal bulan' },
    { id: 'chk_l3', role: 'LEADER', title: 'Controlling Belanja & Forecast Revenue di COGS', desc: 'Pantau pengendalian belanja dan proyeksi Forecast Revenue di fitur COGS untuk menjaga target HPP' },
    { id: 'chk_l4', role: 'LEADER', title: 'Input Budget Cat Cost di Receiving Sheet', desc: 'Apabila ingin melihat Budget Cat Cost, input nominal angka sesuai kategori Excel di fitur Receiving Sheet' },
    { id: 'chk_l5', role: 'LEADER', title: 'Monitoring Revenue Analisa di Rekapan Harian', desc: 'Tujuan penginputan memudahkan input angka nominal revenue analisa dan terpantau transparan di Rekapan Harian' },

    // Cashier Checklists
    { id: 'chk_c1', role: 'CASHIER', title: 'Input Guest Satisfaction Terlebih Dahulu', desc: 'WAJIB diinput sebelum Daily Revenue jika ada komplain tamu / diskon kompensasi 100%' },
    { id: 'chk_c2', role: 'CASHIER', title: 'Input Revenue Sesi Lunch', desc: 'Lunch Sales, Lunch Covers, Discount, Online Food, lalu Copy WA Template Lunch' },
    { id: 'chk_c3', role: 'CASHIER', title: 'Input Revenue Sesi Closing / Dinner', desc: 'Dinner Sales, Dinner Covers, Total Harian, lalu Copy WA Template Closing' },
    { id: 'chk_c4', role: 'CASHIER', title: 'Input Patty Cash Expense Sesuai Bon', desc: 'Penginputan cash HANYA oleh kasir sesuai bon pembelanjaan fisik yang valid' },
    { id: 'chk_c5', role: 'CASHIER', title: 'Periksa Transaksi City Ledger', desc: 'Jika ada tagihan piutang: input Produk, Nominal, PIC, dan Catatan di tanggal yang sama' },
    
    // Store Keeper Checklists
    { id: 'chk_sk1', role: 'STORE_KEEPER', title: 'Input Belanja Sesuai Barang yang di-GR', desc: 'Pastikan input belanja sesuai barang yang diterima (Good Receipt), BUKAN saat menaikkan RO' },
    { id: 'chk_sk2', role: 'STORE_KEEPER', title: 'Penginputan Cash Hanya oleh Kasir Sesuai Bon', desc: 'Store Keeper TIDAK menginput kas; serahkan bon belanja fisik kepada kasir untuk diinput di Patty Cash' },
    { id: 'chk_sk3', role: 'STORE_KEEPER', title: 'Input Chemical, Stationary & Marketing di Fitur Chemical', desc: 'Input item Chemical, Stationary (ATK), & Marketing yang otomatis memotong belanja Main Store setiap tanggalnya' },
    { id: 'chk_sk4', role: 'STORE_KEEPER', title: 'Input Belanja Supplier Rekanan', desc: 'Cukup masukkan Nama Supplier dan total nominal nota yang di-GR' },
    { id: 'chk_sk5', role: 'STORE_KEEPER', title: 'Cek Rekap Receiving Sheet di Dashboard', desc: 'Pastikan total belanja harian telah tercatat dan status sinkronisasi online' }
  ];

  const filteredLeaderSteps = useMemo(() => {
    if (!searchQuery.trim()) return leaderSteps;
    const q = searchQuery.toLowerCase();
    return leaderSteps.filter(s => 
      s.title.toLowerCase().includes(q) || 
      s.summary.toLowerCase().includes(q) ||
      s.points.some(p => p.label.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q))
    );
  }, [searchQuery, leaderSteps]);

  const filteredCashierSteps = useMemo(() => {
    if (!searchQuery.trim()) return cashierSteps;
    const q = searchQuery.toLowerCase();
    return cashierSteps.filter(s => 
      s.title.toLowerCase().includes(q) || 
      s.summary.toLowerCase().includes(q) ||
      s.points.some(p => p.label.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q))
    );
  }, [searchQuery, cashierSteps]);

  const filteredStoreKeeperSteps = useMemo(() => {
    if (!searchQuery.trim()) return storeKeeperSteps;
    const q = searchQuery.toLowerCase();
    return storeKeeperSteps.filter(s => 
      s.title.toLowerCase().includes(q) || 
      s.summary.toLowerCase().includes(q) ||
      s.points.some(p => p.label.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q))
    );
  }, [searchQuery, storeKeeperSteps]);

  return (
    <div className="space-y-6 pb-20 animate-fade-in no-blur">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border border-white/10 p-6 md:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-black uppercase tracking-widest mb-3">
              <i className="fas fa-graduation-cap"></i> Standard Operating Procedure (SOP)
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight flex items-center gap-3">
              Tutorial & Panduan Penggunaan Aplikasi
            </h1>
            <p className="text-xs md:text-sm text-slate-400 max-w-2xl mt-1">
              Panduan terstruktur alur penginputan data harian & bulanan untuk peran <strong className="text-indigo-400">Leader / MOD</strong>, <strong className="text-emerald-400">Cashier</strong>, dan <strong className="text-amber-400">Store Keeper</strong>.
            </p>
          </div>

          {/* Quick Search */}
          <div className="relative w-full md:w-72">
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs"></i>
            <input 
              type="text" 
              placeholder="Cari panduan (misal: target, guest satisfaction, cash)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950/80 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <i className="fas fa-times text-xs"></i>
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2.5 mt-6 pt-6 border-t border-white/10">
          <button
            onClick={() => setActiveRole('LEADER')}
            className={`px-5 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all flex items-center gap-2.5 cursor-pointer ${
              activeRole === 'LEADER'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-700 text-white shadow-lg shadow-indigo-900/40 scale-105'
                : 'bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white'
            }`}
          >
            <i className="fas fa-user-tie"></i>
            Panduan Leader / MOD
          </button>

          <button
            onClick={() => setActiveRole('CASHIER')}
            className={`px-5 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all flex items-center gap-2.5 cursor-pointer ${
              activeRole === 'CASHIER'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-lg shadow-emerald-900/40 scale-105'
                : 'bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white'
            }`}
          >
            <i className="fas fa-cash-register"></i>
            Panduan Cashier
          </button>

          <button
            onClick={() => setActiveRole('STORE_KEEPER')}
            className={`px-5 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all flex items-center gap-2.5 cursor-pointer ${
              activeRole === 'STORE_KEEPER'
                ? 'bg-gradient-to-r from-amber-600 to-orange-700 text-white shadow-lg shadow-amber-900/40 scale-105'
                : 'bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white'
            }`}
          >
            <i className="fas fa-warehouse"></i>
            Panduan Store Keeper
          </button>

          <button
            onClick={() => setActiveRole('SIMULATOR_WA')}
            className={`px-5 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all flex items-center gap-2.5 cursor-pointer ${
              activeRole === 'SIMULATOR_WA'
                ? 'bg-gradient-to-r from-teal-600 to-emerald-700 text-white shadow-lg shadow-teal-900/40 scale-105'
                : 'bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white'
            }`}
          >
            <i className="fab fa-whatsapp"></i>
            Simulator WA Report
          </button>

          <button
            onClick={() => setActiveRole('CHECKLIST')}
            className={`px-5 py-2.5 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all flex items-center gap-2.5 cursor-pointer ${
              activeRole === 'CHECKLIST'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-700 text-white shadow-lg shadow-blue-900/40 scale-105'
                : 'bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white'
            }`}
          >
            <i className="fas fa-clipboard-check"></i>
            Checklist Harian Staf
          </button>
        </div>
      </div>

      {/* TAB 0: LEADER */}
      {activeRole === 'LEADER' && (
        <div className="space-y-6">
          {/* Important Rule Banner Leader */}
          <div className="p-4 md:p-5 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 text-lg">
              <i className="fas fa-user-tie"></i>
            </div>
            <div>
              <h4 className="text-xs font-black text-indigo-300 uppercase tracking-widest">
                SOP LEADER / SUPERVISOR / MOD: TARGET, INVENTORY & CONTROLLING COGS
              </h4>
              <p className="text-xs text-slate-300 mt-1.5 leading-relaxed space-y-1">
                <span className="block">• <strong>Input Budget Revenue & Target Harian</strong> diakses di <strong>Admin Control (Revenue & Target)</strong>. Leader wajib input budget revenue setiap bulan dan target harian yang di-share di group setiap hari. Tujuannya memudahkan penginputan angka nominal revenue analisa dan bisa dilihat di fitur Rekapan Harian.</span>
                <span className="block">• <strong>Leader WAJIB input Opening Inventory</strong> (Ending akhir bulan di bulan sebelumnya) di <strong>Fitur COGS</strong> pada awal bulan.</span>
                <span className="block">• <strong>Controlling Belanja & Forecast Revenue</strong> tersedia dan dipantau langsung di <strong>Fitur COGS</strong>.</span>
                <span className="block">• <strong>Apabila Leader ingin melihat Budget Cat Cost</strong>, silahkan input nominal angka sesuai kategori yang biasa di-input di Excel dan masukkan nominalnya di <strong>Fitur Receiving Sheet</strong>.</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredLeaderSteps.map((step) => (
              <div 
                key={step.id}
                className="glass-card rounded-2xl border border-white/10 bg-slate-900/70 p-6 flex flex-col justify-between shadow-xl hover:border-indigo-500/40 transition-all group"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${step.badgeColor}`}>
                      {step.badge}
                    </span>
                    {onSelectModule && (
                      <button
                        onClick={() => onSelectModule(step.moduleLink)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
                      >
                        <span>{step.moduleName}</span>
                        <i className="fas fa-arrow-right text-[8px]"></i>
                      </button>
                    )}
                  </div>

                  <h3 className="text-base font-black text-white uppercase tracking-tight mb-2 group-hover:text-indigo-300 transition-colors">
                    {step.title}
                  </h3>
                  <p className="text-xs text-slate-400 mb-4">
                    {step.summary}
                  </p>

                  <div className="space-y-2.5 mb-5">
                    {step.points.map((pt, idx) => (
                      <div 
                        key={idx} 
                        className={`p-3 rounded-xl border ${
                          pt.isHighlight 
                            ? 'bg-indigo-950/40 border-indigo-500/40 text-indigo-100' 
                            : 'bg-white/5 border-white/5 text-slate-300'
                        }`}
                      >
                        <div className="text-[11px] font-black uppercase tracking-wider mb-1 flex items-center gap-2">
                          <i className={`fas ${pt.isHighlight ? 'fa-star text-amber-400 animate-pulse' : 'fa-check-circle text-indigo-400'} text-[10px]`}></i>
                          <span>{pt.label}</span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed pl-4">
                          {pt.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {step.notes && (
                  <div className="mt-auto pt-3 border-t border-white/5 text-[10px] text-indigo-300/90 font-bold flex items-start gap-2 bg-indigo-950/20 p-2.5 rounded-xl border border-indigo-500/20">
                    <i className="fas fa-info-circle text-indigo-400 mt-0.5 shrink-0"></i>
                    <span>{step.notes}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 1: CASHIER */}
      {activeRole === 'CASHIER' && (
        <div className="space-y-6">
          {/* Important Rule Banner */}
          <div className="p-4 md:p-5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 text-lg">
              <i className="fas fa-exclamation-circle"></i>
            </div>
            <div>
              <h4 className="text-xs font-black text-emerald-300 uppercase tracking-widest">
                SOP CASHIER: URUTAN PENGINPUTAN HARIAN & KEPEMILIKAN CASH
              </h4>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                1. <strong>Input Guest Satisfaction WAJIB di-input terlebih dahulu sebelum input revenue di Daily Revenue</strong> agar sinkronisasi diskon dan omzet bersih tepat.<br />
                2. <strong>PENGINPUTAN CASH HANYA DI-INPUT OLEH CASHIER SESUAI BON PEMBELANJAAN</strong> (Store Keeper dan divisi lain tidak menginput pengeluaran cash).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredCashierSteps.map((step) => (
              <div 
                key={step.id}
                className="glass-card rounded-2xl border border-white/10 bg-slate-900/70 p-6 flex flex-col justify-between shadow-xl hover:border-emerald-500/40 transition-all group"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${step.badgeColor}`}>
                      {step.badge}
                    </span>
                    {onSelectModule && (
                      <button
                        onClick={() => onSelectModule(step.moduleLink)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
                      >
                        <span>{step.moduleName}</span>
                        <i className="fas fa-arrow-right text-[8px]"></i>
                      </button>
                    )}
                  </div>

                  <h3 className="text-base font-black text-white uppercase tracking-tight mb-2 group-hover:text-emerald-300 transition-colors">
                    {step.title}
                  </h3>
                  <p className="text-xs text-slate-400 mb-4">
                    {step.summary}
                  </p>

                  <div className="space-y-2.5 mb-5">
                    {step.points.map((pt, idx) => (
                      <div 
                        key={idx} 
                        className={`p-3 rounded-xl border ${
                          pt.isHighlight 
                            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-100' 
                            : 'bg-white/5 border-white/5 text-slate-300'
                        }`}
                      >
                        <div className="text-[11px] font-black uppercase tracking-wider mb-1 flex items-center gap-2">
                          <i className={`fas ${pt.isHighlight ? 'fa-bolt text-amber-400 animate-pulse' : 'fa-check-circle text-emerald-400'} text-[10px]`}></i>
                          <span>{pt.label}</span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed pl-4">
                          {pt.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {step.notes && (
                  <div className="mt-auto pt-3 border-t border-white/5 text-[10px] text-amber-300/90 font-bold flex items-start gap-2 bg-amber-950/20 p-2.5 rounded-xl border border-amber-500/20">
                    <i className="fas fa-lightbulb text-amber-400 mt-0.5 shrink-0"></i>
                    <span>{step.notes}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: STORE KEEPER */}
      {activeRole === 'STORE_KEEPER' && (
        <div className="space-y-6">
          {/* Updated Rule Notice Banner */}
          <div className="p-4 md:p-5 rounded-2xl bg-amber-950/40 border border-amber-500/30 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 text-lg">
              <i className="fas fa-boxes"></i>
            </div>
            <div>
              <h4 className="text-xs font-black text-amber-300 uppercase tracking-widest">
                SOP STORE KEEPER: INPUT BELANJA SESUAI GR & PENGELUARAN CASH OLEH KASIR
              </h4>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                • <strong>PENGINPUTAN CASH HANYA DI-INPUT OLEH CASHIER SESUAI BON PEMBELANJAAN</strong> (Store Keeper tidak menginput cash).<br />
                • Belanja di-input <strong>sesuai barang fisik yang di-GR (Good Receipt)</strong>, bukan saat menaikkan RO.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredStoreKeeperSteps.map((step) => (
              <div 
                key={step.id}
                className="glass-card rounded-2xl border border-white/10 bg-slate-900/70 p-6 flex flex-col justify-between shadow-xl hover:border-amber-500/40 transition-all group"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${step.badgeColor}`}>
                      {step.badge}
                    </span>
                    {onSelectModule && (
                      <button
                        onClick={() => onSelectModule(step.moduleLink)}
                        className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
                      >
                        <span>{step.moduleName}</span>
                        <i className="fas fa-arrow-right text-[8px]"></i>
                      </button>
                    )}
                  </div>

                  <h3 className="text-base font-black text-white uppercase tracking-tight mb-2 group-hover:text-amber-300 transition-colors">
                    {step.title}
                  </h3>
                  <p className="text-xs text-slate-400 mb-4">
                    {step.summary}
                  </p>

                  <div className="space-y-2.5 mb-5">
                    {step.points.map((pt, idx) => (
                      <div 
                        key={idx} 
                        className={`p-3 rounded-xl border ${
                          pt.isHighlight 
                            ? 'bg-rose-950/40 border-rose-500/40 text-rose-100' 
                            : 'bg-white/5 border-white/5 text-slate-300'
                        }`}
                      >
                        <div className="text-[11px] font-black uppercase tracking-wider mb-1 flex items-center gap-2">
                          <i className={`fas ${pt.isHighlight ? 'fa-exclamation-circle text-rose-400 animate-pulse' : 'fa-check-circle text-amber-400'} text-[10px]`}></i>
                          <span>{pt.label}</span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed pl-4">
                          {pt.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {step.notes && (
                  <div className="mt-auto pt-3 border-t border-white/5 text-[10px] text-amber-300/90 font-bold flex items-start gap-2 bg-amber-950/20 p-2.5 rounded-xl border border-amber-500/20">
                    <i className="fas fa-lightbulb text-amber-400 mt-0.5 shrink-0"></i>
                    <span>{step.notes}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: SIMULATOR WA REPORT */}
      {activeRole === 'SIMULATOR_WA' && (
        <div className="glass-card rounded-2xl border border-white/10 bg-slate-900/70 p-6 md:p-8 shadow-2xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-white/10">
            <div>
              <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Fitur Otomatisasi Kasir
              </span>
              <h3 className="text-xl font-black text-white uppercase tracking-tight mt-2">
                Simulasi Otomatis Salin Template WhatsApp Report
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Pada modul <strong>Daily Revenue</strong>, setelah kasir menyimpan data Lunch atau Dinner, kasir cukup mengklik tombol <strong className="text-emerald-400">Copy Lunch</strong> / <strong className="text-indigo-400">Copy Dinner</strong> / <strong className="text-amber-400">Copy Closing</strong>.
              </p>
            </div>

            <button
              onClick={handleCopyDemo}
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs uppercase tracking-wider shadow-lg flex items-center gap-2 self-start md:self-auto active:scale-95 transition-all"
            >
              <i className="fab fa-whatsapp text-sm"></i>
              <span>Salin Format WA (Demo)</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Interactive Inputs */}
            <div className="lg:col-span-5 space-y-4 bg-slate-950/60 p-5 rounded-2xl border border-white/5">
              <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2">
                Coba Ubah Angka Simulasi
              </h4>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Nama Outlet</label>
                <input 
                  type="text" 
                  value={demoOutlet} 
                  onChange={(e) => setDemoOutlet(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Revenue Lunch (Rp)</label>
                  <input 
                    type="number" 
                    value={demoLunchRev} 
                    onChange={(e) => setDemoLunchRev(Number(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-emerald-400 font-bold mt-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Cover Lunch (Pax)</label>
                  <input 
                    type="number" 
                    value={demoLunchCover} 
                    onChange={(e) => setDemoLunchCover(Number(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-bold mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Revenue Dinner (Rp)</label>
                  <input 
                    type="number" 
                    value={demoDinnerRev} 
                    onChange={(e) => setDemoDinnerRev(Number(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-indigo-400 font-bold mt-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Cover Dinner (Pax)</label>
                  <input 
                    type="number" 
                    value={demoDinnerCover} 
                    onChange={(e) => setDemoDinnerCover(Number(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-bold mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Discount</label>
                  <input 
                    type="number" 
                    value={demoDiscount} 
                    onChange={(e) => setDemoDiscount(Number(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-xs text-rose-400 font-bold mt-1"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase">GrabFood</label>
                  <input 
                    type="number" 
                    value={demoGrab} 
                    onChange={(e) => setDemoGrab(Number(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-xs text-emerald-300 font-bold mt-1"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase">GoFood</label>
                  <input 
                    type="number" 
                    value={demoGofood} 
                    onChange={(e) => setDemoGofood(Number(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-xs text-rose-300 font-bold mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Live WhatsApp Preview */}
            <div className="lg:col-span-7 bg-[#0b141a] rounded-2xl p-5 border border-emerald-500/20 shadow-inner flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-emerald-500/20 pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs">
                    <i className="fab fa-whatsapp"></i>
                  </div>
                  <div>
                    <div className="text-[11px] font-black text-white">Preview Template Pesan WhatsApp</div>
                    <div className="text-[9px] text-emerald-400">Siap di-Paste ke Grup Operasional</div>
                  </div>
                </div>
                <button
                  onClick={handleCopyDemo}
                  className="px-3 py-1 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 text-[10px] font-black uppercase transition-all"
                >
                  <i className="fas fa-copy mr-1"></i> Copy
                </button>
              </div>

              <pre className="text-xs text-emerald-200/90 font-mono whitespace-pre-wrap leading-relaxed bg-[#111b21] p-4 rounded-xl border border-emerald-950 overflow-x-auto">
                {demoWATemplate}
              </pre>

              <div className="mt-3 text-[10px] text-slate-400 flex items-center justify-between">
                <span>💡 Hasil otomatis dibuat saat tombol Copy diklik pada modul Daily Revenue.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: CHECKLIST HARIAN */}
      {activeRole === 'CHECKLIST' && (
        <div className="glass-card rounded-2xl border border-white/10 bg-slate-900/70 p-6 md:p-8 shadow-2xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-white/10">
            <div>
              <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Self-Audit & Verifikasi Shift
              </span>
              <h3 className="text-xl font-black text-white uppercase tracking-tight mt-2">
                Checklist Kepatuhan Penginputan Staf Harian & Bulanan
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Gunakan checklist interaktif ini untuk memastikan tidak ada penginputan yang terlewat oleh tim Leader, Kasir, dan Store Keeper.
              </p>
            </div>

            <button
              onClick={() => {
                setCompletedChecklist({});
                try {
                  localStorage.removeItem('tutorial_completed_checklist');
                  showToast?.('Checklist harian di-reset.', 'info');
                } catch {}
              }}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 self-start md:self-auto transition-all cursor-pointer"
            >
              <i className="fas fa-redo text-[10px]"></i>
              <span>Reset Checklist</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Leader Checklist */}
            <div className="space-y-3">
              <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                <i className="fas fa-user-tie"></i> Checklist Leader / MOD
              </h4>
              {checklistItems.filter(i => i.role === 'LEADER').map((item) => {
                const isChecked = !!completedChecklist[item.id];
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleChecklist(item.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5 select-none ${
                      isChecked 
                        ? 'bg-indigo-950/30 border-indigo-500/40 text-indigo-200' 
                        : 'bg-white/5 border-white/5 hover:border-white/20 text-slate-300'
                    }`}
                  >
                    <input 
                      type="checkbox" 
                      checked={isChecked}
                      onChange={() => {}}
                      className="mt-0.5 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-500"
                    />
                    <div>
                      <div className={`text-xs font-black uppercase tracking-tight ${isChecked ? 'line-through opacity-80' : 'text-white'}`}>
                        {item.title}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Cashier Checklist */}
            <div className="space-y-3">
              <h4 className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                <i className="fas fa-cash-register"></i> Checklist Cashier Shift
              </h4>
              {checklistItems.filter(i => i.role === 'CASHIER').map((item) => {
                const isChecked = !!completedChecklist[item.id];
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleChecklist(item.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5 select-none ${
                      isChecked 
                        ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200' 
                        : 'bg-white/5 border-white/5 hover:border-white/20 text-slate-300'
                    }`}
                  >
                    <input 
                      type="checkbox" 
                      checked={isChecked}
                      onChange={() => {}}
                      className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-500"
                    />
                    <div>
                      <div className={`text-xs font-black uppercase tracking-tight ${isChecked ? 'line-through opacity-80' : 'text-white'}`}>
                        {item.title}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Store Keeper Checklist */}
            <div className="space-y-3">
              <h4 className="text-xs font-black text-amber-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                <i className="fas fa-warehouse"></i> Checklist Store Keeper Shift
              </h4>
              {checklistItems.filter(i => i.role === 'STORE_KEEPER').map((item) => {
                const isChecked = !!completedChecklist[item.id];
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleChecklist(item.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5 select-none ${
                      isChecked 
                        ? 'bg-amber-950/30 border-amber-500/40 text-amber-200' 
                        : 'bg-white/5 border-white/5 hover:border-white/20 text-slate-300'
                    }`}
                  >
                    <input 
                      type="checkbox" 
                      checked={isChecked}
                      onChange={() => {}}
                      className="mt-0.5 w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer accent-amber-500"
                    />
                    <div>
                      <div className={`text-xs font-black uppercase tracking-tight ${isChecked ? 'line-through opacity-80' : 'text-white'}`}>
                        {item.title}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TutorialModule;
