
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
}

export interface ExcelImageConfig {
  columnKey: string;
  type: 'url' | 'urls'; // 'url' for single image string, 'urls' for array of string
}

const populateSheetWithData = async (
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  columns: ExcelColumn[],
  sheetData: any[],
  imageConfigs: ExcelImageConfig[] = []
) => {
  // Add columns
  worksheet.columns = columns.map(col => ({
    header: col.header.toUpperCase(),
    key: col.key,
    width: col.width || 20
  }));

  // Style header
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1e293b' }
  };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 30;

  // Add data
  for (let i = 0; i < sheetData.length; i++) {
    const rowData = sheetData[i];
    
    // Copy rowData and auto-recalculate No/no sequential numbering list
    const updatedRowData = { ...rowData };
    if ('no' in updatedRowData && typeof updatedRowData.no === 'number') {
      updatedRowData.no = i + 1;
    }
    if ('No' in updatedRowData && typeof updatedRowData.No === 'number') {
      updatedRowData.No = i + 1;
    }

    const row = worksheet.addRow(updatedRowData);
    row.height = 80; // Default height for rows with images
    row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

    // Handle images
    for (const imgConfig of imageConfigs) {
      const value = updatedRowData[imgConfig.columnKey];
      if (!value) continue;

      const columnIndex = columns.findIndex(c => c.key === imgConfig.columnKey) + 1;
      const imageUrls = imgConfig.type === 'urls' ? (Array.isArray(value) ? value : []) : [value];
      
      for (const url of imageUrls) {
        try {
          const response = await fetch(url);
          const buffer = await response.arrayBuffer();
          
          const imageId = workbook.addImage({
            buffer: buffer,
            extension: 'png', // Assuming png or jpeg, ExcelJS handles most
          });

          worksheet.addImage(imageId, {
            tl: { col: columnIndex - 1, row: i + 1 },
            ext: { width: 60, height: 80 },
            editAs: 'oneCell'
          });
          
          // Clear text value if it's an image column
          row.getCell(columnIndex).value = '';
        } catch (error) {
          console.error('Error adding image to Excel:', error);
          row.getCell(columnIndex).value = 'Image Error';
        }
      }
    }
  }

  // Add borders to all cells
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  });
};

export const exportToExcelWithImages = async (
  title: string,
  columns: ExcelColumn[],
  data: any[],
  imageConfigs: ExcelImageConfig[] = []
) => {
  const workbook = new ExcelJS.Workbook();

  // Find unique outlets
  const uniqueOutlets = Array.from(
    new Set(
      data
        .map(item => item && (item.outlet || item.Outlet))
        .filter(out => out && typeof out === 'string' && out.trim() !== '' && out.toUpperCase() !== 'ALL')
    )
  ) as string[];

  const sanitizeSheetName = (name: string) => {
    return name.replace(/[\\/?*\[\]]/g, '').substring(0, 31) || 'Sheet';
  };

  if (uniqueOutlets.length > 1) {
    // 1. First sheet is the combined SUMMARY sheet with original title
    const mainTitle = sanitizeSheetName(title) || 'SUMMARY';
    const mainWorksheet = workbook.addWorksheet(mainTitle);
    await populateSheetWithData(workbook, mainWorksheet, columns, data, imageConfigs);

    // 2. Separate sheet for each unique outlet
    for (const outlet of uniqueOutlets) {
      const outletData = data.filter(item => (item.outlet || item.Outlet) === outlet);
      const sheetName = sanitizeSheetName(outlet);
      const outletWorksheet = workbook.addWorksheet(sheetName);
      await populateSheetWithData(workbook, outletWorksheet, columns, outletData, imageConfigs);
    }
  } else {
    // Single sheet fallback
    const mainTitle = sanitizeSheetName(title) || 'Sheet';
    const worksheet = workbook.addWorksheet(mainTitle);
    await populateSheetWithData(workbook, worksheet, columns, data, imageConfigs);
  }

  // Generate buffer and save
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `${title}.xlsx`);
};
