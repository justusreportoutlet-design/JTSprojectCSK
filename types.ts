export interface CPARecord {
  id: string;
  date: string;
  outlet: Outlet;
  problemPhotoUrl?: string;
  problemPhotoPath?: string;
  findingProblem: string;
  preventive: string;
  action: string;
  pic: string;
  dueDate: string;
  actionPhotoUrl?: string;
  actionPhotoPath?: string;
  status: 'PENDING' | 'RESOLVED';
  division?: Division;
}

export enum ModuleType {
  DASHBOARD = 'DASHBOARD',
  GOOGLE_REVIEW = 'GOOGLE_REVIEW',
  GUEST_COMPLAINT = 'GUEST_COMPLAINT',
  GSI = 'GSI',
  QUALITY_ASSURANCE = 'QUALITY_ASSURANCE',
  COGS = 'COGS',
  BREAK_TIME = 'BREAK_TIME',
  EXPENSES = 'EXPENSES',
  YTD_REPORT = 'YTD_REPORT',
  RECEIVING_SHEET = 'RECEIVING_SHEET',
  REKAPAN = 'REKAPAN',
  REKAPAN_BULANAN = 'REKAPAN_BULANAN',
  WEEKLY_REPORT = 'WEEKLY_REPORT',
  SALES = 'SALES',
  ADMIN = 'ADMIN',
  STAFF_HISTORY = 'STAFF_HISTORY',
  LEAVE = 'LEAVE',
  OVERTIME = 'OVERTIME',
  ATTENDANCE = 'ATTENDANCE',
  LOGISTICS = 'LOGISTICS',
  REGIONAL_REPORT = 'REGIONAL_REPORT',
  REGIONAL_REPORT_SERVICE = 'REGIONAL_REPORT_SERVICE',
  REGIONAL_REPORT_BAR = 'REGIONAL_REPORT_BAR',
  REGIONAL_REPORT_KITCHEN = 'REGIONAL_REPORT_KITCHEN',
  TUTORIAL = 'TUTORIAL',
  EXTERNAL_AUDIT = 'EXTERNAL_AUDIT',
  OUTLET_PERFORMANCE = 'OUTLET_PERFORMANCE',
  PATTY_CASH_EXPENSE = 'PATTY_CASH_EXPENSE',
  CHEMICAL = 'CHEMICAL',
  MAIN_STORE_KITCHEN = 'MAIN_STORE_KITCHEN',
  SUPPLIER_EXPENSE = 'SUPPLIER_EXPENSE',
  CITY_LEDGER = 'CITY_LEDGER',
  GUEST_SATISFACTION = 'GUEST_SATISFACTION',
  COMPLIMENTARY = 'COMPLIMENTARY',
  ENERGY_COST = 'ENERGY_COST',
  WEEKLY_OVERTIME = 'WEEKLY_OVERTIME',
  GOOGLE_SHEETS = 'GOOGLE_SHEETS',
  GMAIL = 'GMAIL',
  STRATEGI = 'STRATEGI',
  VOID_BILL = 'VOID_BILL',
  PROJECT_REPORT = 'PROJECT_REPORT'
}

export interface LaporanRecord {
  id: string;
  lokasi: string;
  pekerjaan: string;
  progres: string | number;
  createdAt?: any;
}

export interface VoidBillRecord {
  id: string;
  outlet: string;
  date: string; // YYYY-MM-DD
  staffName: string; // Nama Staff dari Manpower
  staffRole?: string;
  staffDivision?: string;
  amount: number; // Nominal Void Bill (IDR)
  reason: string; // Alasan Void
  pic: string; // PIC dari Manpower
  picRole?: string;
  billNumber?: string; // Nomor Bill / POS Ref
  tableNumber?: string; // Nomor Meja
  shift?: 'LUNCH' | 'DINNER' | 'ALL_DAY';
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type StrategyCategory = 'PENYEIMBANG' | 'PERCEPATAN';
export type StrategySession = 'LUNCH' | 'DINNER' | 'BOTH';

export interface StrategyMenuItem {
  id: string;
  name: string;
  category: StrategyCategory;
  price: number;
  session?: StrategySession;
  isActive: boolean;
  createdAt?: string;
}

export interface StrategyItemRecord {
  targetQty: number;
  actualQty: number;
  targetRevenue: number;
  actualRevenue: number;
}

export interface DailyStrategyRecord {
  targetPenyeimbangLunch: number;
  targetPercepatanLunch: number;
  targetPenyeimbangDinner: number;
  targetPercepatanDinner: number;
  totalTargetLunch: number;
  totalTargetDinner: number;
  grandTotalTarget: number;

  selectedLunchPenyeimbang: string[];
  selectedLunchPercepatan: string[];
  selectedDinnerPenyeimbang: string[];
  selectedDinnerPercepatan: string[];

  lunchPenyeimbangItems: Record<string, StrategyItemRecord>;
  lunchPercepatanItems: Record<string, StrategyItemRecord>;
  dinnerPenyeimbangItems: Record<string, StrategyItemRecord>;
  dinnerPercepatanItems: Record<string, StrategyItemRecord>;

  actualRevenuePenyeimbangLunch: number;
  actualRevenuePercepatanLunch: number;
  actualRevenuePenyeimbangDinner: number;
  actualRevenuePercepatanDinner: number;

  totalActualLunch: number;
  totalActualDinner: number;
  grandTotalActual: number;

  // Actual Revenue Total & Di Luar Penjualan Menu
  actualRevenueLunchTotal?: number;
  actualRevenueDinnerTotal?: number;
  actualRevenueGrandTotal?: number;
  actualRevenueLunchOutsideMenu?: number;
  actualRevenueDinnerOutsideMenu?: number;
  actualRevenueGrandOutsideMenu?: number;
  contributionLunchMenuPercent?: number;
  contributionDinnerMenuPercent?: number;
  contributionGrandMenuPercent?: number;
  contributionLunchOutsidePercent?: number;
  contributionDinnerOutsidePercent?: number;
  contributionGrandOutsidePercent?: number;

  // Auto COGS tracking
  isTargetAutoFromCogs?: boolean;
  cogsTargetRevenue?: number;
  cogsPercepatanPercent?: number;
  cogsPenyeimbangPercent?: number;

  notes?: string;
  staffTargets?: StaffStrategyTarget[];
  lunchStaffTargets?: StaffStrategyTarget[];
  dinnerStaffTargets?: StaffStrategyTarget[];
  updatedAt?: string;
  updatedBy?: string;
}

export interface StaffMenuItemTarget {
  menuName: string;
  qtyTarget: number;
}

export interface StaffStrategyTarget {
  id: string;
  staffName: string;
  staffRole?: string;
  shift: 'LUNCH' | 'DINNER';
  percepatanTargets: StaffMenuItemTarget[];
  penyeimbangTargets: StaffMenuItemTarget[];
  notes?: string;
}

export interface User {
  email: string;
  isLoggedIn: boolean;
  selectedOutlet?: Outlet;
}

export type SyncStatus = 'online' | 'syncing' | 'offline' | 'error';

export type StaffStatus = 'ACTIVE' | 'RESIGNED_PROSEDUR' | 'RESIGNED_NON_PROSEDUR' | 'MUTASI';

export type Division = 'SERVICE' | 'BAR' | 'KITCHEN' | 'STEWARD' | 'STORE KEEPER' | 'PUBLIC ATTENDANCE';
export type Outlet = 
  | 'SH CIPETE'
  | 'SH KEMANG'
  | 'SH LEBAK BULUS'
  | 'SH ALAM SUTERA'
  | 'SH BINTARO'
  | 'SH THE BARN'
  | 'SH BEKASI'
  | 'SH CIBUBUR'
  | 'SH ALSUT'
  | (string & {});

export interface OutletConfig {
  id: string;
  name: string;
  area: string; // e.g. 'BEKASI', 'JAKARTA', 'TANGGERANG', 'BANDUNG'
  type: string; // e.g. 'REGULAR OUTLET', 'PRIME OUTLET', 'FOOD COURT', 'INDONESIAN'
  createdAt?: string;
  isDeleted?: boolean;
}

export interface BankingPromoItem {
  id: string;
  name: string; // e.g. "Digibank by DBS", "Bank MEGA", "Bank Mandiri"
  terms: string; // Syarat & Ketentuan, e.g. "All F&B Disc 15% Min. Purchase Rp.650.000 (Max. Disc Rp.150.000)"
  isActive: boolean;
  periodKey?: string; // e.g. "2026-09" or optional
  startDate?: string;
  endDate?: string;
  periodStart?: string;
  periodEnd?: string;
  targetOutlets?: string[]; // Outlets where this promo applies, e.g. ['ALL'] or ['SH CIPETE', 'SH THE BARN']
}

export interface PromoSettings {
  bankPromoEnabled: boolean;
  promoEnabled: boolean;
  periodSettings?: Record<string, {
    bankPromoEnabled: boolean;
    promoEnabled: boolean;
  }>;
  customBankPromos?: BankingPromoItem[];
}

export type RegionalArea = 'ALL' | 'JAKARTA' | 'TANGGERANG' | 'BEKASI & CIBUBUR' | 'BEKASI' | 'BANDUNG' | string;

export interface Staff {
  id: string; // Unique instance ID (e.g. "123_SH_BINTARO")
  staffId: string; // Permanent ID for data linking (e.g. "123")
  name: string;
  role: string;
  division?: Division;
  outlet?: Outlet;
  previousOutlet?: Outlet; // For mutation tracking
  isLeader: boolean;
  joinDate?: string;
  status?: StaffStatus;
  statusDate?: string;
  basicSalary?: number;
  bankAccount?: string;
  personalPhone?: string;
  parentPhone?: string;
  nik?: string;
  birthDate?: string;
  email?: string;
  mutatedTo?: Outlet;
  resignDate?: string;
  resignReason?: string;
  mutationDate?: string;
  mutationReason?: string;
}

export interface LeaveRecord {
  id: string;
  staffId: string;
  outlet?: Outlet;
  date: string;
  startDate?: string;
  endDate?: string;
  totalDays?: number;
  reason: string;
}

export interface OvertimeEntry {
  id: string;
  staffId: string;
  outlet?: Outlet;
  date: string;
  clockIn: string;
  clockOut: string;
  breakTime: number;
  totalHours: number;
  overtimeHours: number;
  overtimePay: number;
  notes?: string;
  division?: string;
  staffName?: string;
}

export interface WeeklyOvertimeEntry {
  id?: string;
  week: number; // 1, 2, 3, 4, 5
  weekLabel: string; // e.g. "Week 1 (1 - 7 Sep)"
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  totalStaff: number; // Total Staff Lembur
  totalOvertime: number; // Total Overtime (Hours)
  totalOvertimePay?: number; // Total Overtime (Rp)
  averageOvertime: number; // Average Overtime per Staff (Hours / Staff)
  budgetOvertime?: number; // Budget Overtime (Rp)
  budgetOvertimeHours?: number; // Budget Overtime (Hours)
  budgetServiceHours?: number; // Budget Service (Hours)
  budgetBarHours?: number; // Budget Bar (Hours)
  budgetKitchenHours?: number; // Budget Kitchen (Hours)
  serviceHours?: number; // Service division hours
  barHours?: number; // Bar division hours
  kitchenHours?: number; // Kitchen division hours
  stewardHours?: number; // Steward division hours
  engineeringHours?: number; // Engineering division hours
  leaderHours?: number; // Leader division hours
  hourlyRate?: number; // Overtime rate per hour (e.g. 15000)
  outlet?: string;
  notes?: string;
  divisionNotes?: {
    SERVICE?: string;
    BAR?: string;
    KITCHEN?: string;
    STORE_KEEPER?: string;
    [key: string]: string | undefined;
  };
  budgetHoursPerStaff?: number; // e.g. 35 hours per staff
  updatedAt?: string;
}

export type ManpowerSlotStatus = 'FILLED' | 'VACANT_OPEN' | 'VACANT_HOLD';

export interface ManpowerSlot {
  id: string;
  slotNumber: number;
  status: ManpowerSlotStatus;
  position: string;
  staffName?: string;
  staffId?: string;
  remark?: string;
}

export interface ManpowerSection {
  id: string;
  name: string; // e.g. 'SERVICE LEADER', 'BAR', 'GRILL SECTION', 'STORE KEEPER', 'PUBLIC AREA'
  division: 'SERVICE' | 'BAR' | 'KITCHEN';
  budget: number;
  remark?: string;
  slots: ManpowerSlot[];
}

export interface ExternalManpowerEntry {
  id: string;
  category: string; // e.g. 'CASUAL / DAILY WORKER', 'OUTSOURCING CLEANING', 'SECURITY', 'VENDOR'
  role: string;
  vendorName?: string;
  budget: number;
  actual: number;
  variance: number;
  remark?: string;
  status?: ManpowerSlotStatus;
}

export interface OutletManpowerData {
  outlet: string;
  period?: string; // e.g. YYYY-MM
  previousBudgetTotal?: number;
  sections: ManpowerSection[];
  externalEntries?: ExternalManpowerEntry[];
  updatedAt?: string;
  updatedBy?: string;
}

export interface GSIRow {
  id: string;
  subject: string;
  excellent: number;
  good: number;
  average: number;
  poor: number;
  abstain: number;
}

export interface GuestComplaint {
  id: string;
  date: string;
  outlet: Outlet;
  source: 'GOOGLE REVIEW' | 'GUEST COMMENT FORM' | 'COMPLAINT LANGSUNG';
  // 1. INFORMASI TAMU
  guestName: string;
  phoneNumber?: string;
  visitDate: string;
  incidentTime: string;
  guestCount: number;
  reportedBy?: string;
  position?: string;
  // 2. DETAIL KELUHAN
  area: string;
  tableNumber: string;
  complaintType: string;
  complaintDescription: string;
  involvedParties?: string;
  witnesses?: string;
  // 3. PENANGANAN DI TEMPAT
  immediateHandling: string; // Label: ACTION in image
  handlingStaff: string;
  actionTaken: string; // This might be used for something else or we map correctiveActionPlan to column 11
  analysis: string;
  preventive: string;
  guestStatusLeaving: string; // Label: STATUS TAMU
  followUpRegional: string;
  documentationUrl?: string;
  documentationFollowUpUrl?: string;
  issuePhotos?: string[];
  followUpPhotos?: string[];
  picLeaders?: string; // PIC
  regionalName?: string; // NAMA REGIONAL
  // Operational Issue Report Fields
  followUpAction?: string;
  followUpBy?: string;
  correctiveActionPlan?: string; // Label: CORECTIVE ACTION
  responsiblePerson?: string;
  targetCompletionDate?: string;
  preparedBy?: string;
  checkedBy?: string;
  approvedBy?: string;
  selectedRegionalRM?: string;
  status: 'RESOLVED' | 'PENDING';
}

export interface GoogleReviewData {
  targetRating: number;
  currentRating: number;
  totalReview: number;
  targetReviewCount?: number;
  stars1: number;
  stars2: number;
  stars3: number;
  stars4: number;
  stars5: number;
}

export interface BreakTimeEntry {
  id: string;
  staffId: string;
  outlet: Outlet;
  date: string;
  break1Out?: string;
  break1In?: string;
  break2Out?: string;
  break2In?: string;
  totalBreakMinutes?: number;
  totalBreakHours?: number;
  notes?: string;
}

export interface QASection {
  product: number;
  cleanliness: number;
  grooming: number;
}

export interface QAData {
  kitchen: QASection;
  bar: QASection;
  service: QASection;
}

export interface ExpenseData {
  nonCommodity: number;
  commodity: number;
  cash: number;
  maintenance: number;
  asset: number;
  casual: number;
  atk: number;
  stationary?: number;
  marketing?: number;
  thirdParty: number;
  electricity: number;
  water: number;
  gas: number;
  // Energy Meter Readings
  elecLwbpOpen?: number;
  elecLwbpClose?: number;
  elecwbpOpen?: number;
  elecwbpClose?: number;
  waterOpen?: number;
  waterClose?: number;
  gasOpen?: number;
  gasClose?: number;
  lostBreakageBar: number;
  lostBreakageKitchen: number;
  lostBreakageService: number;
  mainKitchen: number;
  mainStore: number;
  chemical: number;
  guestSupplies: number;
  ikigai: number;
  panfila: number;
  everest: number;
  saungKubil: number;
  tgif: number;
  sukanda: number;
  kebunku?: number;
}

export const SUPPLIERS = ['TGIF', 'SUKANDA', 'EVEREST', 'IKIGAI', 'PANFILA', 'SAUNG KUBIL', 'KEBUNKU'] as const;
export type SupplierName = typeof SUPPLIERS[number];

export type ChemicalSubCategory = 'CHEMICAL' | 'STATIONARY' | 'MARKETING';

export interface LedgerItem {
  id: string;
  name: string;
  qty: number;
  price: number;
  reason: string;
  pic: string;
  supplier?: SupplierName;
  category?: ChemicalSubCategory | string;
  outlet?: string | Outlet;
  date?: string;
  description?: string;
  division?: 'BAR' | 'KITCHEN' | string;
}

export interface DailySalesData {
  revenue: number;
  covers: number;
  lunchRevenue?: number;
  lunchCovers?: number;
  dinnerRevenue?: number;
  dinnerCovers?: number;
  discountLunch?: number;
  discountDinner?: number;
  // Breakdown specific discounts
  discLunchInvestor?: number;
  discLunchInvestor2?: number;
  discLunchInvestor3?: number;
  discLunchPakYudi?: number;
  discLunchBankMega?: number;
  discLunchMember?: number;
  discLunchCadangan1?: number;
  discLunchCadangan2?: number;
  discLunchCadangan3?: number;
  discDinnerInvestor?: number;
  discDinnerInvestor2?: number;
  discDinnerInvestor3?: number;
  discDinnerPakYudi?: number;
  discDinnerBankMega?: number;
  discDinnerMember?: number;
  discDinnerCadangan1?: number;
  discDinnerCadangan2?: number;
  discDinnerCadangan3?: number;
  discClosingInvestor?: number;
  discClosingInvestor2?: number;
  discClosingInvestor3?: number;
  discClosingCadangan1?: number;
  discClosingCadangan2?: number;
  discClosingCadangan3?: number;
  // Today's Revenue Breakdown
  dineInRevenue?: number;
  takeAwayRevenue?: number;
  goFoodRevenue?: number;
  grabFoodRevenue?: number;
  takeAwayLunch?: number;
  takeAwayDinner?: number;
  goFoodLunch?: number;
  goFoodDinner?: number;
  grabFoodLunch?: number;
  grabFoodDinner?: number;
  customerSatRevenue?: number;
  discManagementRevenue?: number;
  discManagementName?: string;
  // Cashier
  pettyCash?: number;
  setorTunai?: number;
  inputNonFood?: string;
  // Extra Details for Closing Report
  investorName?: string;
  investorName2?: string;
  investorName3?: string;
  cadanganName1?: string;
  cadanganName2?: string;
  cadanganName3?: string;
  membershipCover?: number;
  membershipCoverLunch?: number;
  membershipCoverDinner?: number;
  membershipRevenueLunch?: number;
  membershipRevenueDinner?: number;
  membershipRevenue?: number;
  bankMegaCover?: number;
  bankMegaCoverLunch?: number;
  bankMegaCoverDinner?: number;
  bankMegaRevenueLunch?: number;
  bankMegaRevenueDinner?: number;
  bankMegaRevenue?: number;
  digibankCover?: number;
  digibankCoverLunch?: number;
  digibankCoverDinner?: number;
  digibankRevenueLunch?: number;
  digibankRevenueDinner?: number;
  digibankRevenue?: number;
  digibankDiscount?: number;
  totalDiscount?: number;
  promoBankEntries?: Record<string, {
    coverLunch?: number;
    cover?: number;
    coverDinner?: number;
    revLunch?: number;
    rev?: number;
    revDinner?: number;
    disc?: number;
    name?: string;
  }>;
}

export interface SalesData {
  revenue: number;
  covers: number;
  monthlyBudgets?: Record<string, number>;
  budgetRevenue: number;
  dailyTarget: number;
  todayRevenue: number;
  todayCovers: number;
  todayLunchRevenue?: number;
  todayLunchCovers?: number;
  todayDinnerRevenue?: number;
  todayDinnerCovers?: number;
  todayDiscountLunch?: number;
  todayDiscountDinner?: number;
  // Breakdown specific discounts
  todayDiscLunchInvestor?: number;
  todayDiscLunchInvestor2?: number;
  todayDiscLunchInvestor3?: number;
  todayDiscLunchPakYudi?: number;
  todayDiscLunchBankMega?: number;
  todayDiscLunchMember?: number;
  todayDiscLunchCadangan1?: number;
  todayDiscLunchCadangan2?: number;
  todayDiscLunchCadangan3?: number;
  todayDiscDinnerInvestor?: number;
  todayDiscDinnerInvestor2?: number;
  todayDiscDinnerInvestor3?: number;
  todayDiscDinnerPakYudi?: number;
  todayDiscDinnerBankMega?: number;
  todayDiscDinnerMember?: number;
  todayDiscDinnerCadangan1?: number;
  todayDiscDinnerCadangan2?: number;
  todayDiscDinnerCadangan3?: number;
  todayDiscClosingInvestor?: number;
  todayDiscClosingInvestor2?: number;
  todayDiscClosingInvestor3?: number;
  todayDiscClosingCadangan1?: number;
  todayDiscClosingCadangan2?: number;
  todayDiscClosingCadangan3?: number;
  // Revenue Breakdown
  todayDineInRevenue?: number;
  todayTakeAwayRevenue?: number;
  todayGoFoodRevenue?: number;
  todayGrabFoodRevenue?: number;
  // Cashier
  todayPettyCash?: number;
  todaySetorTunai?: number;
  todayInputNonFood?: string;
  // Extra Details for Closing Report
  todayInvestorName?: string;
  todayInvestorName2?: string;
  todayInvestorName3?: string;
  todayCadanganName1?: string;
  todayCadanganName2?: string;
  todayCadanganName3?: string;
  todayMembershipCover?: number;
  todayMembershipRevenueLunch?: number;
  todayMembershipRevenueDinner?: number;
  todayMembershipRevenue?: number;
  todayBankMegaCover?: number;
  todayBankMegaRevenueLunch?: number;
  todayBankMegaRevenueDinner?: number;
  todayBankMegaRevenue?: number;
  todayDigibankCover?: number;
  todayDigibankRevenueLunch?: number;
  todayDigibankRevenueDinner?: number;
  todayDigibankRevenue?: number;
  todayDigibankDiscount?: number;
  todayCustomerSatRevenue?: number;
  todayDiscManagementRevenue?: number;
  todayDiscManagementName?: string;
  dailyRecording: Record<string, DailySalesData>;
}

export interface Notification {
  id: string;
  user: string;
  outlet: Outlet;
  timestamp: string;
  message: string;
}

export type AttendanceStatus = 'HADIR' | 'OFF' | 'CUTI' | 'ALFA' | 'IZIN' | 'SAKIT_DOC' | 'SAKIT_NO_DOC' | 'PH';

export interface AttendanceEntry {
  id: string;
  staffId: string;
  date: string;
  status: AttendanceStatus;
  outlet: Outlet;
  notes?: string;
}

export interface DailyReport {
  id: string;
  date: string;
  outlet: Outlet;
  category: 'OPERATIONAL' | 'MAINTENANCE' | 'OPERATING_EQUIPMENT' | 'INCIDENT' | 'COMPLAINT' | 'GUEST_GSI' | 'OTHER';
  division: 'BAR' | 'KITCHEN' | 'SERVICE';
  note: string; // Report
  findings?: string; // Description/Findings
  findingsList?: string[]; // List of Findings
  resolution?: string; // Description/Resolution of Findings
  followUpBy?: string; // Follow-up By
  reporterPIC: string;
  resolverPIC?: string;
  isFollowedUp: boolean;
  checklist?: { task: string; completed: boolean }[];
  timestamp: string;
}

export interface LogisticAsset {
  id: string;
  name: string;
  category: 'BAR' | 'KITCHEN' | 'SERVICE' | 'HK' | 'OTHER';
  unit: string;
  parStock: number;
  outlet: Outlet;
}

export interface LogisticStockEntry {
  id: string;
  assetId: string;
  date: string;
  stockOnHand: number;
  lost: number;
  addition: number;
  endingStock: number;
  notes?: string;
  outlet: Outlet;
}

export interface GuestSupplyItem {
  id: string;
  name: string;
  parStock: number;
  outlet: Outlet;
  unit?: string;
  price?: number;
  category?: string;
}

export interface GuestSupplyEntry {
  id: string;
  itemId: string;
  date: string;
  in: number; // Auto dari outStore
  out: number; // Pemakaian (Manual)
  inStore: number; // In to Store (Manual)
  outStore: number; // Distribusi to Checker (Manual)
  parStockChecker?: number; // Manual Input
  parStockStore?: number; // Manual Input
  orderToStore: number;
  endingStock: number;
  isDelivered?: boolean; // delivery to in stock checker
  notes?: string;
  outlet: Outlet;
}

export interface TipsIncoming {
  id: string;
  nominal: number;
  description: string;
  timestamp: string;
}

export interface TipsLoan {
  id: string;
  name: string;
  nominal: number;
  timestamp?: string;
}

export interface TipsRepayment {
  id: string;
  name: string;
  nominal: number;
  pembagian: number;
  totalCrew: number;
  manPowerService: number;
  manPowerKitchen: number;
  manPowerSteward: number;
  manPowerPublicAttendance: number;
  manPowerStoreKeeper: number;
  timestamp?: string;
}

export interface DailyTipsData {
  incoming: TipsIncoming[];
  loans: TipsLoan[];
  repayments: TipsRepayment[];
}

export interface Presence {
  uid: string;
  email: string;
  lastSeen: string;
  outlet?: string;
}

export interface ChatMessage {
  id: string;
  text: string;
  senderEmail: string;
  senderName: string;
  timestamp: string;
  outlet?: string;
  serverTime?: any;
}

export interface ExternalAuditRecord {
  id: string;
  date: string;
  outlet: Outlet;
  department: 'SERVICE' | 'BAR' | 'KITCHEN';
  findings: string;
  takenAction: string;
  pic: string;
  documentationUrls: string[];
  status: 'RESOLVED' | 'PENDING';
}

export interface LogisticItem {
  id: string;
  description: string;
  createdAt: string;
  price?: number;
}

export interface DailyLogisticRecord {
  layak: number;
  tidakLayak: number;
  lnb: number;
  penggantian: number;
}

export interface PeminjamanRecord {
  id: string;
  date: string;
  itemId: string;
  borrower: string;
  qty: number;
  status: 'BORROWED' | 'RETURNED';
  returnDate?: string;
  returnQty?: number;
}

export interface ScheduleDayCell {
  shift?: string;
  ot?: number | string;
}

export interface StaffScheduleRow {
  staffId: string;
  name: string;
  position: string;
  joinDate?: string;
  days: Record<string, ScheduleDayCell>;
  ket?: string;
}

export interface MonthlyScheduleState {
  periodType?: 'PERIOD_26_25' | 'FULL_MONTH';
  schedules?: Record<string, StaffScheduleRow>;
}

export interface ExpenseCategoryBudgets {
  commodity?: number;
  nonCommodity?: number;
  chemical?: number;
  maintenance?: number;
  atk?: number;
  asset?: number;
  [key: string]: number | undefined;
}

export interface DivisionAllocationItem {
  id: string;
  name: string;
  percent: number;
  color?: string; // 'blue' | 'amber' | 'purple' | 'emerald' | 'rose' | 'cyan' | 'indigo'
  icon?: string;
  isCustom?: boolean;
}

export interface SupplierAllocationItem {
  id: string;
  name: string;
  percent: number;
  color?: string;
  icon?: string;
}

export interface DivisionSupplierChannelShare {
  supplier: number;     // Rekanan Mitra Supplier % (e.g. 50%)
  mainKitchen: number;  // Main Kitchen (MK) % (e.g. 30%)
  mainStore: number;    // Main Store (MS) % (e.g. 10%)
  cash: number;         // Cash / Pasar % (e.g. 10%)
  supplierBreakdown?: Record<string, number>; // Breakdown of 7 partners: tgif, sukanda, everest, ikigai, panfila, saungKubil, kebunku
}

export interface MonthlyCogsData {
  targetCogsPercent?: number;
  targetBudgetPercent?: number; // e.g. 43.00%
  beginningInventory?: number; // Opening Inventory
  endingInventory?: number; // Closing Inventory Nominal (Rp)
  closingInventoryPercent?: number; // Closing Inventory % of MTD Revenue (e.g. 10.00%)
  rnd?: number; // Research & Development expenditure
  actualGuestSupplies?: number; // Actual Guest Supplies spending
  actualSpoiled?: number; // Actual Spoiled spending
  actualWaste?: number; // Actual Waste spending
  actualNonCommodity?: number; // Actual Non Commodity spending
  maxClosingInvPercent?: number; // e.g. 11.00%
  manualCutoffDay?: number;
  manualWeekdayAvgSales?: number;
  manualWeekendAvgSales?: number;
  manualWeekdayForecast?: number;
  manualWeekendForecast?: number;
  manualMtdBelanja?: number; // Optional override for MTD Belanja
  useManualMtdBelanja?: boolean;
  kitchenSharePercent?: number; // e.g. 70%
  barSharePercent?: number; // e.g. 20%
  serviceSharePercent?: number; // e.g. 10%
  divisionAllocations?: DivisionAllocationItem[]; // Dynamic divisional allocation of sisa budget belanja
  divisionSupplierAllocations?: Record<string, DivisionSupplierChannelShare>; // Dynamic supplier allocation per division from 100% sisa budget divisi
  supplierAllocations?: SupplierAllocationItem[]; // Dynamic supplier allocation of purchasing budget
  supplierAllocationMode?: 'AUTO' | 'CUSTOM'; // 'AUTO' (synced from actual MTD average) vs 'CUSTOM'
  orderDays?: number[]; // e.g. [1, 3, 5] (Monday, Wednesday, Friday)
  strategyTargetRevenue?: number;
  strategyPercepatanPercent?: number; // e.g. 80
  strategyPenyeimbangPercent?: number; // e.g. 20
  strategyBasis?: 'AUTO' | 'MTD' | 'WEEKDAY' | 'WEEKEND' | 'MANUAL';
  strategyManualLunchPercent?: number;
  strategyManualDinnerPercent?: number;
  strategyTargetDate?: string;
  customProcurementBudget?: number;
  procurementBudgetBasis?: 'COGS_TARGET' | 'COGS_REMAINING' | 'ACTUAL_SPEND' | 'CUSTOM';
  notes?: string;
}

export interface AppState {
  outlet?: string;
  logisticItems?: LogisticItem[];
  dailyLogisticRecords?: Record<string, Record<string, DailyLogisticRecord>>;
  peminjamanRecords?: PeminjamanRecord[];
  logisticBeginningStocks?: Record<string, Record<string, number>>;
  logisticPeriodPrices?: Record<string, Record<string, number>>;
  staffList: Staff[];
  googleReview: GoogleReviewData;
  dailyGoogleReview: Record<string, GoogleReviewData>;
  dailyGSI: Record<string, GSIRow[]>;
  qa: QAData; // Keep for legacy
  dailyQA: Record<string, QAData>;
  dailyBreakTime?: Record<string, BreakTimeEntry[]>;
  monthlyCogsData?: Record<string, MonthlyCogsData>;
  expenses: Record<string, ExpenseData>;
  dailyMainKitchenLedger: Record<string, LedgerItem[]>;
  dailyMainStoreLedger: Record<string, LedgerItem[]>;
  dailyChemicalLedger: Record<string, LedgerItem[]>;
  dailyGuestSuppliesLedger: Record<string, LedgerItem[]>;
  cityLedger: LedgerItem[]; // Keep for legacy
  dailyCityLedger: Record<string, LedgerItem[]>;
  customerSat: LedgerItem[]; // Keep for legacy
  dailyCustomerSat: Record<string, LedgerItem[]>;
  complimentary: LedgerItem[]; // Keep for legacy
  dailyComplimentary: Record<string, LedgerItem[]>;
  sales: SalesData;
  dailyTargets: Record<string, number>;
  holidays: string[];
  leaveRecords: LeaveRecord[];
  dailyOvertime: Record<string, OvertimeEntry[]>;
  weeklyOvertime?: Record<string, WeeklyOvertimeEntry[]>;
  dailyAttendance: Record<string, AttendanceEntry[]>;
  dailyReports: Record<string, DailyReport[]>;
  dailyReportSummaries: Record<string, string>;
  monthlyOvertimeBudgets?: Record<string, Record<string, number>>;
  weeklyOvertimeBudgetMonthly?: Record<string, number>;
  divisionOvertimeBudgetsHours?: Record<string, Record<string, number>>;
  overtimeHourlyRate?: number;
  bankingPromos?: BankingPromoItem[];
  customOutlets?: OutletConfig[];
  promoSettings?: PromoSettings;
  monthlyDiscountNames?: Record<string, Record<string, string>>;
  overtimeBudgets: Record<string, number>;
  budgetAvgOvertimeHours?: number;
  // New Ledgers for OPEX and Suppliers
  dailyNonCommodityLedger: Record<string, LedgerItem[]>;
  dailyCommodityLedger: Record<string, LedgerItem[]>;
  dailyMaintenanceLedger: Record<string, LedgerItem[]>;
  dailyAssetLedger: Record<string, LedgerItem[]>;
  dailyCasualLedger: Record<string, LedgerItem[]>;
  dailyAtkLedger: Record<string, LedgerItem[]>;
  dailyThirdPartyLedger: Record<string, LedgerItem[]>;
  dailyCashLedger: Record<string, LedgerItem[]>;
  dailyIkigaiLedger: Record<string, LedgerItem[]>;
  dailyPanfilaLedger: Record<string, LedgerItem[]>;
  dailyEverestLedger: Record<string, LedgerItem[]>;
  dailySaungKubilLedger: Record<string, LedgerItem[]>;
  dailyTgifLedger: Record<string, LedgerItem[]>;
  dailySukandaLedger: Record<string, LedgerItem[]>;
  dailyKebunkuLedger?: Record<string, LedgerItem[]>;
  dailyGasLedger?: Record<string, LedgerItem[]>;
  energyCost?: any;
  dailyTips: Record<string, DailyTipsData>;
  dailyCPA: Record<string, CPARecord[]>;
  monthlySchedule?: Record<string, MonthlyScheduleState>;
  dailyExternalAudit: Record<string, ExternalAuditRecord[]>;
  guestComplaints: GuestComplaint[];
  opexBudgetPercentage?: number;
  expenseCategoryBudgets?: ExpenseCategoryBudgets;
  monthlyExpenseCategoryBudgets?: Record<string, ExpenseCategoryBudgets>;
  pattyCashBudgetPercentage?: number;
  pattyCashCategoryBudgetPct?: Record<string, number>;
  monthlyPattyCashBudgetPercent?: Record<string, number>;
  monthlyPattyCashCategoryBudgetPct?: Record<string, Record<string, number>>;
  pattyCashBudgetNominal?: number;
  pattyCashCategoryBudgets?: Record<string, number>;
  monthlyPattyCashBudgetNominal?: Record<string, number>;
  monthlyPattyCashCategoryBudgets?: Record<string, Record<string, number>>;
  affiliateHistory: {
    id: string;
    productUrl: string;
    scripts: string[];
    timestamp: string;
    length: 'short' | 'medium' | 'long' | 'story' | 'reels';
    style: string;
  }[];
  manpowerData?: Record<string, OutletManpowerData>;
  dailyStrategy?: Record<string, DailyStrategyRecord>;
  dailyVoidBills?: Record<string, VoidBillRecord[]>;
  voidBills?: VoidBillRecord[];
}
