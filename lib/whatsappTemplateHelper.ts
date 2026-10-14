export interface WhatsAppExpenseItem {
  name: string;
  qty: number;
  unit?: string;
  totalSpend: number;
  avgPrice?: number;
  category?: string;
}

export interface WhatsAppExpenseCategoryGroup {
  categoryName: string; // e.g. "COMMODITY", "CLEANING & CHEMICAL", "MAIN STORE", etc.
  totalSpend?: number;
  items?: WhatsAppExpenseItem[];
}

export type WhatsAppExpenseTemplateType = 'DETAILED_ITEMS' | 'CATEGORY_AMOUNT_ONLY';

export interface WhatsAppExpenseOptions {
  title?: string; // e.g. "REKAP PATTY CASH EXPENSE", "REKAP CHEMICAL", etc.
  sticker?: string; // emoji sticker e.g. "🧪", "💵", "🏢", "🥩"
  templateType?: WhatsAppExpenseTemplateType;
  outletName: string;
  startDay: number;
  endDay: number;
  monthName: string;
  year: number;
  categories: WhatsAppExpenseCategoryGroup[];
  totalSpendAll: number;
  lastMonthSpend: number;
  currentMtdRevenue: number;
  lastMonthMtdRevenue?: number;
  notes?: string;
}

/**
 * Returns appropriate default sticker for expense title
 */
export const getDefaultStickerForTitle = (title: string): string => {
  const t = title.toUpperCase();
  if (t.includes('PATTY CASH') || t.includes('PETTY CASH')) return '💵';
  if (t.includes('STORE') && t.includes('KITCHEN')) return '🏢';
  if (t.includes('MAIN STORE')) return '🏬';
  if (t.includes('MAIN KITCHEN')) return '🍳';
  if (t.includes('SUPPLIER') || t.includes('REKANAN')) return '🥩';
  if (t.includes('CHEMICAL') && (t.includes('STATIONARY') || t.includes('MARKETING'))) return '🧼';
  if (t.includes('CHEMICAL')) return '🧪';
  if (t.includes('STATIONARY') || t.includes('ATK')) return '📝';
  if (t.includes('MARKETING')) return '📢';
  return '📊';
};

export const generateWhatsAppExpenseText = (opts: WhatsAppExpenseOptions): string => {
  const {
    title = 'REKAP PATTY CASH EXPENSE',
    sticker,
    templateType,
    outletName,
    startDay,
    endDay,
    monthName,
    year,
    categories,
    totalSpendAll,
    lastMonthSpend,
    currentMtdRevenue
  } = opts;

  // Determine sticker
  const chosenSticker = sticker || getDefaultStickerForTitle(title);

  // Determine template type (auto-detect if not specified)
  const isDetailed = templateType === 'DETAILED_ITEMS' || 
    (!templateType && (
      title.toUpperCase().includes('CHEMICAL') || 
      title.toUpperCase().includes('STATIONARY') || 
      title.toUpperCase().includes('MARKETING')
    ));

  let msg = `${chosenSticker} *${title.toUpperCase()}*\n`;
  msg += `*OUTLET* : ${outletName.toUpperCase()}\n`;
  msg += `*PERIODE* : ${startDay} - ${endDay} ${monthName.toUpperCase()} ${year}\n`;
  msg += `----------------------------------------------------\n`;
  msg += `- *CATTEGORY*\n`;

  if (isDetailed) {
    // ==========================================
    // TEMPLATE 1: KHUSUS CHEMICAL, STATIONARY & MARKETING
    // ==========================================
    categories.forEach((cat, catIdx) => {
      msg += `*${cat.categoryName.toUpperCase()}*\n`;

      if (!cat.items || cat.items.length === 0) {
        msg += `*Item* \n`;
        msg += `- -\n`;
        msg += `- *Qty* : -\n`;
        msg += `- *Amount* : Rp. 0\n`;
      } else {
        cat.items.forEach((it) => {
          const formattedSpend = Number(it.totalSpend || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
          const unitStr = it.unit ? ` ${it.unit}` : '';
          msg += `*Item* \n`;
          msg += `- *${it.name.toUpperCase()}*\n`;
          msg += `- *Qty* : ${it.qty}${unitStr}\n`;
          msg += `- *Amount* : Rp. ${formattedSpend}\n`;
        });
      }

      // Add category divider
      msg += `-----------------------------------------------------\n`;
    });
  } else {
    // ==========================================
    // TEMPLATE 2: KHUSUS MAIN STORE, MAIN KITCHEN, PATTY CASH EXPENSE, DAN SUPPLIER
    // ==========================================
    categories.forEach((cat) => {
      const spend = cat.totalSpend !== undefined 
        ? cat.totalSpend 
        : (cat.items?.reduce((s, i) => s + (i.totalSpend || 0), 0) || 0);
      
      const formattedSpend = Number(spend || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
      msg += `*${cat.categoryName}*\n`;
      msg += `- *Amount* : Rp. ${formattedSpend}\n`;
    });

    // Add category divider
    msg += `----------------------------------------------------------\n`;
  }

  // Summary Metrics Section (Consistent across both templates)
  const formattedMtdExpenses = Number(totalSpendAll || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
  const ratio = currentMtdRevenue > 0
    ? ((totalSpendAll / currentMtdRevenue) * 100).toFixed(2)
    : '0.00';

  const varianceRp = totalSpendAll - lastMonthSpend;
  const variancePct = lastMonthSpend > 0
    ? ((varianceRp / lastMonthSpend) * 100).toFixed(2)
    : (totalSpendAll > 0 ? '100.00' : '0.00');
  const sign = varianceRp >= 0 ? '+' : '-';
  const formattedVariance = `${sign}Rp. ${Math.abs(Number(varianceRp)).toLocaleString('id-ID', { maximumFractionDigits: 2 })} (${sign}${Math.abs(Number(variancePct))}%)`;

  msg += `*MTD EXPENSES* : Rp. ${formattedMtdExpenses}\n`;
  msg += `*MTD REVENUE VS EXPENSE* : ${ratio}%\n`;
  msg += `*VARIANCE VS LAST MONTH* : ${formattedVariance}\n\n`;
  msg += `Generated automatically via Justus Executive System`;

  return msg;
};
