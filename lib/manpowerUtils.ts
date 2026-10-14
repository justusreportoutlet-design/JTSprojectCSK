import { OutletManpowerData, ManpowerSection, ExternalManpowerEntry } from '../types';

export const createDefaultManpowerData = (outletName: string = 'SH THE BARN'): OutletManpowerData => {
  const sections: ManpowerSection[] = [
    // 1. SERVICE LEADER (SERVICE)
    {
      id: 'sec_service_leader',
      name: 'SERVICE LEADER',
      division: 'SERVICE',
      budget: 4,
      slots: [
        { id: 'slot_sl_1', slotNumber: 1, status: 'VACANT_OPEN', position: 'Restaurant Manager', remark: '' },
        { id: 'slot_sl_2', slotNumber: 2, status: 'FILLED', position: 'Restaurant Supervisor', remark: '' },
        { id: 'slot_sl_3', slotNumber: 3, status: 'FILLED', position: 'Restaurant Captain', remark: '' },
        { id: 'slot_sl_4', slotNumber: 4, status: 'FILLED', position: 'Restaurant Captain', remark: '' },
      ]
    },
    // 2. GREETER (SERVICE)
    {
      id: 'sec_greeter',
      name: 'GREETER',
      division: 'SERVICE',
      budget: 3,
      slots: [
        { id: 'slot_gr_1', slotNumber: 1, status: 'FILLED', position: 'Greeter', remark: '' },
        { id: 'slot_gr_2', slotNumber: 2, status: 'FILLED', position: 'Greeter', remark: '' },
        { id: 'slot_gr_3', slotNumber: 3, status: 'FILLED', position: 'Greeter', remark: '' },
      ]
    },
    // 3. FB CASHIER (SERVICE)
    {
      id: 'sec_fb_cashier',
      name: 'FB CASHIER',
      division: 'SERVICE',
      budget: 2,
      slots: [
        { id: 'slot_cs_1', slotNumber: 1, status: 'FILLED', position: 'Cashier', remark: '' },
        { id: 'slot_cs_2', slotNumber: 2, status: 'FILLED', position: 'Cashier', remark: '' },
      ]
    },
    // 4. FOOD CHECKER (SERVICE)
    {
      id: 'sec_food_checker',
      name: 'FOOD CHECKER',
      division: 'SERVICE',
      budget: 2,
      slots: [
        { id: 'slot_fc_1', slotNumber: 1, status: 'FILLED', position: 'Food Checker', remark: '' },
        { id: 'slot_fc_2', slotNumber: 2, status: 'FILLED', position: 'Food Checker', remark: '' },
      ]
    },
    // 5. SERVER (SERVICE)
    {
      id: 'sec_server',
      name: 'SERVER',
      division: 'SERVICE',
      budget: 4,
      slots: [
        { id: 'slot_sv_1', slotNumber: 1, status: 'FILLED', position: 'Waiter', remark: '' },
        { id: 'slot_sv_2', slotNumber: 2, status: 'FILLED', position: 'Waiter', remark: '' },
        { id: 'slot_sv_3', slotNumber: 3, status: 'FILLED', position: 'Waiter', remark: '' },
        { id: 'slot_sv_4', slotNumber: 4, status: 'VACANT_OPEN', position: 'Waiter', remark: '' },
      ]
    },
    // 6. PUBLIC AREA (IN HOUSE - MASUK DIVISI SERVICE SESUAI PERMINTAAN USER)
    {
      id: 'sec_public_area',
      name: 'PUBLIC AREA',
      division: 'SERVICE',
      budget: 2,
      slots: [
        { id: 'slot_pa_1', slotNumber: 1, status: 'FILLED', position: 'PA', remark: '' },
        { id: 'slot_pa_2', slotNumber: 2, status: 'VACANT_OPEN', position: 'PA', remark: '' },
      ]
    },
    // 7. BAR (BAR)
    {
      id: 'sec_bar',
      name: 'BAR',
      division: 'BAR',
      budget: 4,
      slots: [
        { id: 'slot_bar_1', slotNumber: 1, status: 'FILLED', position: 'Bar Captain', remark: '' },
        { id: 'slot_bar_2', slotNumber: 2, status: 'FILLED', position: 'Barista', remark: '' },
        { id: 'slot_bar_3', slotNumber: 3, status: 'FILLED', position: 'Barista', remark: '' },
        { id: 'slot_bar_4', slotNumber: 4, status: 'FILLED', position: 'Barista', remark: 'Join date 2 Mei 2026' },
      ]
    },
    // 8. KITCHEN LEADER (KITCHEN)
    {
      id: 'sec_kitchen_leader',
      name: 'KITCHEN LEADER',
      division: 'KITCHEN',
      budget: 4,
      slots: [
        { id: 'slot_kl_1', slotNumber: 1, status: 'FILLED', position: 'Sous chef', remark: '' },
        { id: 'slot_kl_2', slotNumber: 2, status: 'FILLED', position: 'CDP', remark: '' },
        { id: 'slot_kl_3', slotNumber: 3, status: 'FILLED', position: 'Demi Chef', remark: '' },
        { id: 'slot_kl_4', slotNumber: 4, status: 'FILLED', position: 'Demi Chef', remark: '' },
      ]
    },
    // 9. GRILL SECTION (KITCHEN)
    {
      id: 'sec_grill',
      name: 'GRILL SECTION',
      division: 'KITCHEN',
      budget: 2,
      slots: [
        { id: 'slot_grill_1', slotNumber: 1, status: 'FILLED', position: 'Cook', remark: '' },
        { id: 'slot_grill_2', slotNumber: 2, status: 'FILLED', position: 'Cook', remark: '' },
      ]
    },
    // 10. ASIAN SECTION (KITCHEN)
    {
      id: 'sec_asian',
      name: 'ASIAN SECTION',
      division: 'KITCHEN',
      budget: 4,
      slots: [
        { id: 'slot_asian_1', slotNumber: 1, status: 'FILLED', position: 'Cook', remark: '' },
        { id: 'slot_asian_2', slotNumber: 2, status: 'VACANT_OPEN', position: 'Cook', remark: '' },
        { id: 'slot_asian_3', slotNumber: 3, status: 'FILLED', position: 'Cook', remark: '' },
        { id: 'slot_asian_4', slotNumber: 4, status: 'FILLED', position: 'Cook', remark: '' },
      ]
    },
    // 11. FRYER SECTION (KITCHEN)
    {
      id: 'sec_fryer',
      name: 'FRYER SECTION',
      division: 'KITCHEN',
      budget: 2,
      slots: [
        { id: 'slot_fryer_1', slotNumber: 1, status: 'FILLED', position: 'Cook', remark: '' },
        { id: 'slot_fryer_2', slotNumber: 2, status: 'FILLED', position: 'Cook', remark: '' },
      ]
    },
    // 12. PREPARATION SECTION (KITCHEN)
    {
      id: 'sec_prep',
      name: 'PREPARATION SECTION',
      division: 'KITCHEN',
      budget: 2,
      slots: [
        { id: 'slot_prep_1', slotNumber: 1, status: 'FILLED', position: 'Cook', remark: '' },
        { id: 'slot_prep_2', slotNumber: 2, status: 'FILLED', position: 'Cook', remark: '' },
      ]
    },
    // 13. STEWARD (KITCHEN)
    {
      id: 'sec_steward',
      name: 'STEWARD',
      division: 'KITCHEN',
      budget: 3,
      slots: [
        { id: 'slot_st_1', slotNumber: 1, status: 'FILLED', position: 'Steward', remark: '' },
        { id: 'slot_st_2', slotNumber: 2, status: 'FILLED', position: 'Steward', remark: '' },
        { id: 'slot_st_3', slotNumber: 3, status: 'FILLED', position: 'Steward', remark: '' },
      ]
    },
    // 14. STORE KEEPER (MASUK DIVISI KITCHEN SESUAI PERMINTAAN USER)
    {
      id: 'sec_store_keeper',
      name: 'STORE KEEPER',
      division: 'KITCHEN',
      budget: 1,
      slots: [
        { id: 'slot_sk_1', slotNumber: 1, status: 'FILLED', position: 'Storekeeper', remark: '' },
      ]
    }
  ];

  const externalEntries: ExternalManpowerEntry[] = [
    {
      id: 'ext_dw_1',
      category: 'DAILY WORKER / CASUAL',
      role: 'Casual Steward / Helper',
      vendorName: 'Outsource Mandiri',
      budget: 2,
      actual: 2,
      variance: 0,
      status: 'FILLED',
      remark: 'Support Weekend & Event Khusus'
    },
    {
      id: 'ext_clean_1',
      category: 'OUTSOURCING CLEANING',
      role: 'Night Deep Cleaner',
      vendorName: 'PT Bersih Berkah',
      budget: 1,
      actual: 1,
      variance: 0,
      status: 'FILLED',
      remark: 'Shift Malam (00:00 - 06:00)'
    }
  ];

  return {
    outlet: outletName,
    previousBudgetTotal: 45,
    sections,
    externalEntries,
    updatedAt: new Date().toISOString()
  };
};

export interface DivisionSummaryRow {
  no: number;
  name: string;
  divisionCode: string;
  currentBudget: number;
  actual: number;
  variance: number;
  previousBudget: number;
}

export const calculateManpowerSummary = (manpowerData: OutletManpowerData) => {
  const sections = manpowerData.sections || [];
  const externalEntries = manpowerData.externalEntries || [];

  // Rules:
  // Store Keeper -> KITCHEN
  // Public Area In-House -> SERVICE

  let serviceBudget = 0;
  let serviceActual = 0;

  let barBudget = 0;
  let barActual = 0;

  let kitchenBudget = 0;
  let kitchenActual = 0;

  let stewardBudget = 0;
  let stewardActual = 0;

  let storekeeperBudget = 0;
  let storekeeperActual = 0;

  let paBudget = 0;
  let paActual = 0;

  let totalVacantOpen = 0;
  let totalVacantHold = 0;

  sections.forEach(sec => {
    const secName = sec.name.toUpperCase();
    const actualCount = sec.slots.filter(s => s.status === 'FILLED').length;
    const vOpen = sec.slots.filter(s => s.status === 'VACANT_OPEN').length;
    const vHold = sec.slots.filter(s => s.status === 'VACANT_HOLD').length;

    totalVacantOpen += vOpen;
    totalVacantHold += vHold;

    if (secName.includes('STORE KEEPER') || secName.includes('STOREKEEPER')) {
      storekeeperBudget += sec.budget;
      storekeeperActual += actualCount;
      kitchenBudget += sec.budget;
      kitchenActual += actualCount;
    } else if (secName.includes('STEWARD')) {
      stewardBudget += sec.budget;
      stewardActual += actualCount;
      kitchenBudget += sec.budget;
      kitchenActual += actualCount;
    } else if (secName.includes('PUBLIC AREA') || secName.includes('PUBLIC ATTENDANT')) {
      paBudget += sec.budget;
      paActual += actualCount;
      serviceBudget += sec.budget;
      serviceActual += actualCount;
    } else if (sec.division === 'BAR') {
      barBudget += sec.budget;
      barActual += actualCount;
    } else if (sec.division === 'KITCHEN') {
      kitchenBudget += sec.budget;
      kitchenActual += actualCount;
    } else {
      // SERVICE
      serviceBudget += sec.budget;
      serviceActual += actualCount;
    }
  });

  // External Manpower
  let externalBudget = 0;
  let externalActual = 0;
  externalEntries.forEach(ext => {
    externalBudget += Number(ext.budget) || 0;
    externalActual += Number(ext.actual) || 0;
  });

  const totalInhouseBudget = sections.reduce((acc, s) => acc + (Number(s.budget) || 0), 0);
  const totalInhouseActual = sections.reduce((acc, s) => acc + s.slots.filter(slot => slot.status === 'FILLED').length, 0);
  const totalInhouseVariance = totalInhouseActual - totalInhouseBudget;

  const previousBudgetTotal = manpowerData.previousBudgetTotal || 45;

  const rows: DivisionSummaryRow[] = [
    {
      no: 1,
      name: 'SERVICE',
      divisionCode: 'SERVICE',
      currentBudget: serviceBudget,
      actual: serviceActual,
      variance: serviceActual - serviceBudget,
      previousBudget: 18
    },
    {
      no: 2,
      name: 'BAR',
      divisionCode: 'BAR',
      currentBudget: barBudget,
      actual: barActual,
      variance: barActual - barBudget,
      previousBudget: 4
    },
    {
      no: 3,
      name: 'KITCHEN',
      divisionCode: 'KITCHEN',
      currentBudget: kitchenBudget,
      actual: kitchenActual,
      variance: kitchenActual - kitchenBudget,
      previousBudget: 16
    },
    {
      no: 4,
      name: 'STEWARD',
      divisionCode: 'STEWARD',
      currentBudget: stewardBudget,
      actual: stewardActual,
      variance: stewardActual - stewardBudget,
      previousBudget: 4
    },
    {
      no: 5,
      name: 'STOREKEEPER',
      divisionCode: 'STOREKEEPER',
      currentBudget: storekeeperBudget,
      actual: storekeeperActual,
      variance: storekeeperActual - storekeeperBudget,
      previousBudget: 1
    },
    {
      no: 6,
      name: 'PUBLIC ATTENDANT (IN HOUSE)',
      divisionCode: 'PUBLIC_AREA',
      currentBudget: paBudget,
      actual: paActual,
      variance: paActual - paBudget,
      previousBudget: 2
    }
  ];

  return {
    rows,
    serviceBudget,
    serviceActual,
    serviceVariance: serviceActual - serviceBudget,
    barBudget,
    barActual,
    barVariance: barActual - barBudget,
    kitchenBudget,
    kitchenActual,
    kitchenVariance: kitchenActual - kitchenBudget,
    stewardBudget,
    stewardActual,
    storekeeperBudget,
    storekeeperActual,
    paBudget,
    paActual,
    externalBudget,
    externalActual,
    externalVariance: externalActual - externalBudget,
    totalInhouseBudget,
    totalInhouseActual,
    totalInhouseVariance,
    totalVacantOpen,
    totalVacantHold,
    previousBudgetTotal,
    grandTotalBudget: totalInhouseBudget + externalBudget,
    grandTotalActual: totalInhouseActual + externalActual,
    grandTotalVariance: (totalInhouseActual + externalActual) - (totalInhouseBudget + externalBudget)
  };
};

export type ManpowerWaFillMode = 'COUNT' | 'COUNT_WITH_NAMES' | 'FILLED_NAMES' | 'TEMPLATE_ONLY';

export interface ManpowerWaReportOptions {
  area?: string;
  outletIndex?: number;
  mode?: ManpowerWaFillMode;
  vacantFallback?: string; // default e.g. '-'
}

export const getFilledStaff = (
  slots: { status: string; staffName?: string; position: string }[],
  mode: ManpowerWaFillMode = 'COUNT'
): string => {
  if (mode === 'TEMPLATE_ONLY') return '';
  const filled = slots.filter(s => s.status === 'FILLED');
  const count = filled.length;
  const names = filled
    .map(s => s.staffName?.trim())
    .filter((n): n is string => Boolean(n && n.length > 0));

  if (mode === 'COUNT') {
    return `${count} Orang`;
  }
  if (mode === 'COUNT_WITH_NAMES') {
    if (names.length > 0) {
      return `${count} Orang (${names.join(', ')})`;
    }
    return `${count} Orang`;
  }
  if (mode === 'FILLED_NAMES') {
    if (names.length > 0) {
      return names.join(', ');
    }
    return `${count} Orang`;
  }
  return `${count} Orang`;
};

const getVacantList = (
  slots: { status: string; position: string; remark?: string }[],
  status: 'VACANT_OPEN' | 'VACANT_HOLD',
  mode: ManpowerWaFillMode = 'COUNT',
  fallback: string = '-'
): string[] => {
  const targetSlots = slots.filter(s => s.status === status);
  if (targetSlots.length === 0) {
    return [fallback];
  }
  const counts: Record<string, number> = {};
  targetSlots.forEach(s => {
    const role = (s.position || s.remark || 'Staff').trim();
    counts[role] = (counts[role] || 0) + 1;
  });

  return Object.entries(counts).map(([role, count]) => `- ${count} Orang (${role})`);
};

export const generateSingleOutletManpowerWaReport = (
  manpowerData: OutletManpowerData,
  outletName: string,
  options?: ManpowerWaReportOptions
): string => {
  const mode = options?.mode || 'COUNT';
  const fallback = options?.vacantFallback || '-';
  const outletIndex = options?.outletIndex ?? 1;

  const sections = manpowerData?.sections || [];

  // 1. SERVICE
  const serviceSections = sections.filter(s => s.division === 'SERVICE');
  const serviceSlots = serviceSections.flatMap(s => s.slots);

  // Helper to match service roles
  const serviceLeaderSlots = serviceSlots.filter(s =>
    /leader|manager|supervisor|captain|spv|asst/i.test(s.position) ||
    serviceSections.some(sec => sec.slots.includes(s) && /leader/i.test(sec.name))
  );
  const serviceCashierSlots = serviceSlots.filter(s =>
    /cashier/i.test(s.position) ||
    serviceSections.some(sec => sec.slots.includes(s) && /cashier/i.test(sec.name))
  );
  const serviceGreeterSlots = serviceSlots.filter(s =>
    /greeter/i.test(s.position) ||
    serviceSections.some(sec => sec.slots.includes(s) && /greeter/i.test(sec.name))
  );
  const serviceCheckerSlots = serviceSlots.filter(s =>
    /checker/i.test(s.position) ||
    serviceSections.some(sec => sec.slots.includes(s) && /checker/i.test(sec.name))
  );
  const serviceServerSlots = serviceSlots.filter(s =>
    /server|waiter/i.test(s.position) ||
    serviceSections.some(sec => sec.slots.includes(s) && /server/i.test(sec.name))
  );
  const servicePublicAreaSlots = serviceSlots.filter(s =>
    /pa\b|public|attend/i.test(s.position) ||
    serviceSections.some(sec => sec.slots.includes(s) && /public/i.test(sec.name))
  );

  const serviceLeaderText = getFilledStaff(serviceLeaderSlots, mode);
  const serviceCashierText = getFilledStaff(serviceCashierSlots, mode);
  const serviceGreeterText = getFilledStaff(serviceGreeterSlots, mode);
  const serviceCheckerText = getFilledStaff(serviceCheckerSlots, mode);
  const serviceServerText = getFilledStaff(serviceServerSlots, mode);
  const servicePublicAreaText = getFilledStaff(servicePublicAreaSlots, mode);

  const serviceVacantOpen = getVacantList(serviceSlots, 'VACANT_OPEN', mode, fallback);
  const serviceVacantHold = getVacantList(serviceSlots, 'VACANT_HOLD', mode, fallback);

  // 2. BAR
  const barSections = sections.filter(s => s.division === 'BAR');
  const barSlots = barSections.flatMap(s => s.slots);

  const barLeaderSlots = barSlots.filter(s =>
    /captain|leader|spv|supervisor|head/i.test(s.position)
  );
  const barBaristaSlots = barSlots.filter(s =>
    /barista|bartender/i.test(s.position) ||
    !/captain|leader|spv|supervisor|head/i.test(s.position)
  );

  const barLeaderText = getFilledStaff(barLeaderSlots, mode);
  const barBaristaText = getFilledStaff(barBaristaSlots, mode);

  const barVacantOpen = getVacantList(barSlots, 'VACANT_OPEN', mode, fallback);
  const barVacantHold = getVacantList(barSlots, 'VACANT_HOLD', mode, fallback);

  // 3. KITCHEN
  const kitchenSections = sections.filter(s => s.division === 'KITCHEN');
  const kitchenSlots = kitchenSections.flatMap(s => s.slots);

  const kitchenLeaderSlots = kitchenSlots.filter(s =>
    /chef|cdp|leader|head/i.test(s.position) ||
    kitchenSections.some(sec => sec.slots.includes(s) && /leader/i.test(sec.name))
  );
  const kitchenGrillSlots = kitchenSlots.filter(s =>
    /grill/i.test(s.position) ||
    kitchenSections.some(sec => sec.slots.includes(s) && /grill/i.test(sec.name))
  );
  const kitchenAsianSlots = kitchenSlots.filter(s =>
    /asian/i.test(s.position) ||
    kitchenSections.some(sec => sec.slots.includes(s) && /asian/i.test(sec.name))
  );
  const kitchenPrepSlots = kitchenSlots.filter(s =>
    /prep/i.test(s.position) ||
    kitchenSections.some(sec => sec.slots.includes(s) && /prep/i.test(sec.name))
  );
  const kitchenFryerSlots = kitchenSlots.filter(s =>
    /fryer/i.test(s.position) ||
    kitchenSections.some(sec => sec.slots.includes(s) && /fryer/i.test(sec.name))
  );
  const kitchenStewardSlots = kitchenSlots.filter(s =>
    /steward/i.test(s.position) ||
    kitchenSections.some(sec => sec.slots.includes(s) && /steward/i.test(sec.name))
  );
  const kitchenStoreKeeperSlots = kitchenSlots.filter(s =>
    /store/i.test(s.position) ||
    kitchenSections.some(sec => sec.slots.includes(s) && /store/i.test(sec.name))
  );

  const kitchenLeaderText = getFilledStaff(kitchenLeaderSlots, mode);
  const kitchenGrillText = getFilledStaff(kitchenGrillSlots, mode);
  const kitchenAsianText = getFilledStaff(kitchenAsianSlots, mode);
  const kitchenPrepText = getFilledStaff(kitchenPrepSlots, mode);
  const kitchenFryerText = getFilledStaff(kitchenFryerSlots, mode);
  const kitchenStewardText = getFilledStaff(kitchenStewardSlots, mode);
  const kitchenStoreKeeperText = getFilledStaff(kitchenStoreKeeperSlots, mode);

  // Check any extra sections in Service, Bar, Kitchen if custom sections were added
  const coveredServiceNames = /leader|manager|supervisor|captain|cashier|greeter|checker|server|waiter|public|pa\b/i;
  const extraServiceSections = serviceSections.filter(sec => !coveredServiceNames.test(sec.name));
  const extraServiceLines = extraServiceSections.map(sec => `- ${sec.name} :${opt(getFilledStaff(sec.slots, mode))}`);

  const coveredBarNames = /captain|leader|spv|supervisor|head|barista|bartender/i;
  const extraBarSections = barSections.filter(sec => !coveredBarNames.test(sec.name) && sec.name !== 'BAR');
  const extraBarLines = extraBarSections.map(sec => `- ${sec.name} :${opt(getFilledStaff(sec.slots, mode))}`);

  const coveredKitchenNames = /leader|chef|cdp|grill|asian|prep|fryer|steward|store/i;
  const extraKitchenSections = kitchenSections.filter(sec => !coveredKitchenNames.test(sec.name));
  const extraKitchenLines = extraKitchenSections.map(sec => `- ${sec.name} :${opt(getFilledStaff(sec.slots, mode))}`);

  const kitchenVacantOpen = getVacantList(kitchenSlots, 'VACANT_OPEN', mode, fallback);
  const kitchenVacantHold = getVacantList(kitchenSlots, 'VACANT_HOLD', mode, fallback);

  const opt = (val: string, defaultSpace: string = '') => (val ? ` ${val}` : defaultSpace);

  // Exact template spacing and bold asterisks
  const serviceLines = [
    `- Leader :${opt(serviceLeaderText)}`,
    `- Cashier :${opt(serviceCashierText)}`,
    `- Greeter :${opt(serviceGreeterText, ' ')}`,
    `- Food Checker :${opt(serviceCheckerText)}`,
    `- Server :${opt(serviceServerText)}`,
    `- Public Attendence :${opt(servicePublicAreaText)}`,
    ...extraServiceLines
  ].join('\n');

  const barLines = [
    `- Leader  :${opt(barLeaderText)}`,
    `- Barista :${opt(barBaristaText)}`,
    ...extraBarLines
  ].join('\n');

  const kitchenLines = [
    `- Leader :${opt(kitchenLeaderText)}`,
    `- Section Grilled :${opt(kitchenGrillText)}`,
    `- Section Asian :${opt(kitchenAsianText)}`,
    `- Preparation :${opt(kitchenPrepText)}`,
    `- Section Fryer :${opt(kitchenFryerText)}`,
    `- Steward :${opt(kitchenStewardText)}`,
    `- Store Keeper :${opt(kitchenStoreKeeperText)}`,
    ...extraKitchenLines
  ].join('\n');

  return `*${outletIndex}. ${outletName}*
*SERVICE*
${serviceLines}

*Vacant Open* 
${serviceVacantOpen.join('\n')}
*Vacant Hold*
${serviceVacantHold.join('\n')}


*BAR*
${barLines}

*Vacant Open*
${barVacantOpen.join('\n')}
*Vacant Hold*
${barVacantHold.join('\n')}

*KITCHEN*
${kitchenLines}

*Vacant Open*
${kitchenVacantOpen.join('\n')}
*Vacant Hold*
${kitchenVacantHold.join('\n')}`;
};

export const generateManpowerWaReport = (
  outlets: { name: string; data: OutletManpowerData }[],
  areaName: string = '',
  options?: ManpowerWaReportOptions
): string => {
  const header = `*MAN POWER UPDATE*\n*AREA* : ${areaName ? areaName.trim() : ''}\n\n`;
  const outletReports = outlets.map((outlet, idx) => {
    return generateSingleOutletManpowerWaReport(outlet.data, outlet.name, {
      ...options,
      outletIndex: idx + 1
    });
  });

  return `${header}${outletReports.join('\n\n\n')}`;
};

/**
 * Calculates a score for how much actual user-entered data exists in a manpower object.
 * Returns > 0 if any staff names, custom remarks, or external entries exist.
 */
export const getManpowerFilledScore = (mp: any): number => {
  if (!mp || !Array.isArray(mp.sections)) return 0;
  let score = 0;
  mp.sections.forEach((sec: any) => {
    if (sec && Array.isArray(sec.slots)) {
      sec.slots.forEach((s: any) => {
        if (s && s.staffName && typeof s.staffName === 'string' && s.staffName.trim().length > 0) {
          score += 10;
        }
        if (s && s.remark && typeof s.remark === 'string' && s.remark.trim().length > 0) {
          score += 3;
        }
      });
    }
  });
  if (Array.isArray(mp.externalEntries) && mp.externalEntries.length > 0) {
    score += mp.externalEntries.length * 5;
  }
  return score;
};

/**
 * Resolves OutletManpowerData for a given outlet and month.
 * If data for the exact month is not found or is empty, it seamlessly falls back to the most recent month
 * or any previously saved manpower data with filled information for that outlet, ensuring filled data is NEVER lost when switching months.
 */
export const resolveOutletManpowerData = (
  allManpower: Record<string, any> | undefined,
  outlet: string,
  targetMonthKey?: string
): OutletManpowerData => {
  if (!allManpower || typeof allManpower !== 'object') {
    return createDefaultManpowerData(outlet);
  }

  const isValidManpower = (mp: any): boolean => {
    return !!(mp && Array.isArray(mp.sections) && mp.sections.length > 0);
  };

  // Helper to clone and ensure outlet/period are set
  const cloneManpower = (src: any): OutletManpowerData => {
    try {
      const cloned = JSON.parse(JSON.stringify(src));
      cloned.outlet = outlet;
      if (targetMonthKey) cloned.period = targetMonthKey;
      return cloned as OutletManpowerData;
    } catch (e) {
      return { ...src, outlet, period: targetMonthKey || src.period };
    }
  };

  // 1. Exact match for target month (e.g. "SH THE BARN_2026-03")
  if (targetMonthKey) {
    const exactKey = `${outlet}_${targetMonthKey}`;
    const targetData = allManpower[exactKey];
    if (isValidManpower(targetData) && getManpowerFilledScore(targetData) > 0) {
      return cloneManpower(targetData);
    }
  }

  // 2. Search for filled data in other months for this outlet
  const outletPrefix = `${outlet}_`;
  const candidateKeys = Object.keys(allManpower).filter(k => k.startsWith(outletPrefix) && !k.endsWith('_LATEST'));

  // First priority: Search backwards from targetMonthKey (most recent prior filled month)
  if (targetMonthKey) {
    const priorKeys = candidateKeys
      .filter(k => k.replace(outletPrefix, '') <= targetMonthKey)
      .sort()
      .reverse();

    for (const key of priorKeys) {
      if (isValidManpower(allManpower[key]) && getManpowerFilledScore(allManpower[key]) > 0) {
        return cloneManpower(allManpower[key]);
      }
    }
  }

  // Second priority: ANY month for this outlet with filled data (sorted descending so latest comes first)
  const allOutletMonthKeys = [...candidateKeys].sort().reverse();
  for (const key of allOutletMonthKeys) {
    if (isValidManpower(allManpower[key]) && getManpowerFilledScore(allManpower[key]) > 0) {
      return cloneManpower(allManpower[key]);
    }
  }

  // Third priority: Latest or legacy key if it has filled data
  const latestKey = `${outlet}_LATEST`;
  if (isValidManpower(allManpower[latestKey]) && getManpowerFilledScore(allManpower[latestKey]) > 0) {
    return cloneManpower(allManpower[latestKey]);
  }
  if (isValidManpower(allManpower[outlet]) && getManpowerFilledScore(allManpower[outlet]) > 0) {
    return cloneManpower(allManpower[outlet]);
  }

  // Fourth priority: If exact targetMonthKey has valid sections (even if empty score), return it
  if (targetMonthKey) {
    const exactKey = `${outlet}_${targetMonthKey}`;
    if (isValidManpower(allManpower[exactKey])) {
      return cloneManpower(allManpower[exactKey]);
    }
  }

  // Fifth priority: Legacy key or latest key if valid sections exist
  if (isValidManpower(allManpower[latestKey])) {
    return cloneManpower(allManpower[latestKey]);
  }
  if (isValidManpower(allManpower[outlet])) {
    return cloneManpower(allManpower[outlet]);
  }
  for (const key of allOutletMonthKeys) {
    if (isValidManpower(allManpower[key])) {
      return cloneManpower(allManpower[key]);
    }
  }

  // Fallback to default template
  return createDefaultManpowerData(outlet);
};

/**
 * Merges manpower data from all months (0..11) and root sources for an outlet,
 * giving a consolidated map of all known manpower configurations.
 */
export const extractOutletManpowerMap = (
  outletRawData: any,
  globalManpower?: Record<string, any>
): Record<string, OutletManpowerData> => {
  const map: Record<string, OutletManpowerData> = {};
  if (globalManpower && typeof globalManpower === 'object') {
    Object.assign(map, globalManpower);
  }
  if (!outletRawData || typeof outletRawData !== 'object') {
    return map;
  }
  if (outletRawData.manpowerData && typeof outletRawData.manpowerData === 'object') {
    Object.assign(map, outletRawData.manpowerData);
  }
  // Check each month 0..11
  for (let m = 0; m < 12; m++) {
    const mData = outletRawData[String(m)] || outletRawData[m] || outletRawData?.monthlyData?.[String(m)] || outletRawData?.monthlyData?.[m];
    if (mData?.manpowerData && typeof mData.manpowerData === 'object') {
      Object.assign(map, mData.manpowerData);
    }
  }
  return map;
};
