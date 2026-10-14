import { getWorkspaceAccessToken } from './workspaceAuth';

export interface SpreadsheetFile {
  id: string;
  name: string;
  modifiedTime: string;
  webViewLink?: string;
}

export interface SheetMetadata {
  properties: {
    sheetId: number;
    title: string;
    index: number;
    gridProperties?: {
      rowCount: number;
      columnCount: number;
    };
  };
}

export interface SpreadsheetDetails {
  spreadsheetId: string;
  properties: {
    title: string;
    locale?: string;
    timeZone?: string;
  };
  sheets: SheetMetadata[];
  spreadsheetUrl: string;
}

const getAuthHeaders = async () => {
  const token = await getWorkspaceAccessToken();
  if (!token) {
    throw new Error('Akses token Google Workspace tidak tersedia. Silakan hubungkan akun Google terlebih dahulu.');
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
};

export async function createSpreadsheet(
  title: string, 
  sheetTitles: string[] = ['Sheet1']
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const headers = await getAuthHeaders();
  const sheets = sheetTitles.map(name => ({
    properties: { title: name }
  }));

  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      properties: { title },
      sheets
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal membuat spreadsheet: ${res.statusText}`);
  }

  const data = await res.json();
  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetUrl: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`
  };
}

export async function listSpreadsheets(searchTerm?: string): Promise<SpreadsheetFile[]> {
  const headers = await getAuthHeaders();
  let query = "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false";
  if (searchTerm && searchTerm.trim()) {
    const escaped = searchTerm.replace(/'/g, "\\'");
    query += ` and name contains '${escaped}'`;
  }

  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime,webViewLink)&orderBy=modifiedTime desc&pageSize=25`;
  const res = await fetch(url, { headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal memuat daftar Google Spreadsheet: ${res.statusText}`);
  }

  const data = await res.json();
  return data.files || [];
}

export async function getSpreadsheetDetails(spreadsheetId: string): Promise<SpreadsheetDetails> {
  const headers = await getAuthHeaders();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, { headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal mengambil info spreadsheet: ${res.statusText}`);
  }

  return await res.json();
}

export async function readRange(spreadsheetId: string, range: string): Promise<any[][]> {
  const headers = await getAuthHeaders();
  const encodedRange = encodeURIComponent(range);
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}`, { headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal membaca sel range: ${res.statusText}`);
  }

  const data = await res.json();
  return data.values || [];
}

export async function writeRange(
  spreadsheetId: string, 
  range: string, 
  values: any[][]
): Promise<{ updatedCells: number; updatedRows: number }> {
  const headers = await getAuthHeaders();
  const encodedRange = encodeURIComponent(range);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers,
      body: JSON.stringify({ values })
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal memperbarui spreadsheet: ${res.statusText}`);
  }

  return await res.json();
}

export async function appendRows(
  spreadsheetId: string, 
  range: string, 
  values: any[][]
): Promise<any> {
  const headers = await getAuthHeaders();
  const encodedRange = encodeURIComponent(range);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ values })
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal menambahkan baris: ${res.statusText}`);
  }

  return await res.json();
}

export async function exportCustomTableToGoogleSheet(
  spreadsheetTitle: string,
  sheetName: string,
  headers: string[],
  rows: any[][]
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  // Step 1: Create spreadsheet
  const { spreadsheetId, spreadsheetUrl } = await createSpreadsheet(spreadsheetTitle, [sheetName]);

  // Step 2: Populate headers and rows
  const allValues = [headers, ...rows];
  await writeRange(spreadsheetId, `${sheetName}!A1`, allValues);

  return { spreadsheetId, spreadsheetUrl };
}
