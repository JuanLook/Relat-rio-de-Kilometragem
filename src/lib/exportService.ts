import * as XLSX from 'xlsx';
import { MileageEntry, MONTHS_PT, WeekClosure } from '../types';
import { sortEntriesChronologically } from './validation';

export interface MonthExportPayload {
  year: number;
  month: number;
  totalWeeks: number;
  weeks: Record<number, WeekClosure>;
  entries: MileageEntry[];
}

function getMonthLabel(month: number): string {
  return MONTHS_PT.find((m) => m.number === month)?.name || `Mes_${month}`;
}

/**
 * Builds structured tabular rows for both Google Sheets and Excel (.xlsx) exports,
 * presenting Monthly Totals followed by side-by-side / sequential V1 and UP weekly blocks.
 */
function buildMonthSheetMatrix(payload: MonthExportPayload): (string | number)[][] {
  const { year, month, totalWeeks, weeks, entries } = payload;
  const monthName = getMonthLabel(month);

  const v1Entries = entries.filter((e) => e.company === 'V1');
  const upEntries = entries.filter((e) => e.company === 'UP');

  const totalMonthV1 = v1Entries.reduce((acc, e) => acc + e.kmResult, 0);
  const totalMonthUP = upEntries.reduce((acc, e) => acc + e.kmResult, 0);
  const totalGeneral = totalMonthV1 + totalMonthUP;

  const rows: (string | number)[][] = [];

  rows.push([
    `CONTROLE CORPORATIVO DE QUILOMETRAGEM — ${monthName.toUpperCase()} / ${year}`,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ]);
  rows.push([]);
  rows.push([
    'RESUMO ACUMULADO DO MÊS',
    '',
    'Total V1 (KM):',
    totalMonthV1,
    '',
    'Total UP (KM):',
    totalMonthUP,
    '',
    'Total Geral (KM):',
    totalGeneral,
    '',
  ]);
  rows.push([]);

  for (let w = 1; w <= totalWeeks; w++) {
    const weekDoc = weeks[w];
    const statusLabel = weekDoc?.isLocked ? 'FECHADA' : 'ABERTA';

    const weekV1 = sortEntriesChronologically(
      v1Entries.filter((e) => e.weekNumber === w),
    );
    const weekUP = sortEntriesChronologically(
      upEntries.filter((e) => e.weekNumber === w),
    );

    const sumV1 = weekDoc?.isLocked
      ? weekDoc.lockedTotalV1
      : weekV1.reduce((acc, e) => acc + e.kmResult, 0);
    const sumUP = weekDoc?.isLocked
      ? weekDoc.lockedTotalUP
      : weekUP.reduce((acc, e) => acc + e.kmResult, 0);

    rows.push([
      `SEMANA ${w} (${statusLabel}) — EMPRESA V1`,
      '',
      '',
      '',
      '',
      '',
      `SEMANA ${w} (${statusLabel}) — EMPRESA UP`,
      '',
      '',
      '',
      '',
    ]);

    rows.push([
      'Data',
      'KM Inicial',
      'KM Final',
      'Resultado (KM)',
      'Descrição',
      '',
      'Data',
      'KM Inicial',
      'KM Final',
      'Resultado (KM)',
      'Descrição',
    ]);

    const maxRows = Math.max(weekV1.length, weekUP.length, 1);
    for (let i = 0; i < maxRows; i++) {
      const itemV1 = weekV1[i];
      const itemUP = weekUP[i];

      const leftCols: (string | number)[] = itemV1
        ? [
            itemV1.dateDisplay,
            itemV1.kmStart,
            itemV1.kmEnd,
            itemV1.kmResult,
            itemV1.description,
          ]
        : i === 0 && weekV1.length === 0
          ? ['Sem registros', '', '', 0, '']
          : ['', '', '', '', ''];

      const rightCols: (string | number)[] = itemUP
        ? [
            itemUP.dateDisplay,
            itemUP.kmStart,
            itemUP.kmEnd,
            itemUP.kmResult,
            itemUP.description,
          ]
        : i === 0 && weekUP.length === 0
          ? ['Sem registros', '', '', 0, '']
          : ['', '', '', '', ''];

      rows.push([...leftCols, '', ...rightCols]);
    }

    rows.push([
      `Total Semana ${w} (V1)`,
      '',
      '',
      sumV1,
      weekDoc?.isLocked ? 'Total fixado no fechamento' : 'Subtotal parcial',
      '',
      `Total Semana ${w} (UP)`,
      '',
      '',
      sumUP,
      weekDoc?.isLocked ? 'Total fixado no fechamento' : 'Subtotal parcial',
    ]);
    rows.push([]);
  }

  return rows;
}

/**
 * Generates and downloads a multi-tab Excel (.xlsx) file for the active month.
 */
export function exportMonthToExcel(payload: MonthExportPayload): void {
  const { year, month, totalWeeks, weeks, entries } = payload;
  const monthName = getMonthLabel(month);
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Consolidated Side-by-Side Overview
  const overviewMatrix = buildMonthSheetMatrix(payload);
  const overviewSheet = XLSX.utils.aoa_to_sheet(overviewMatrix);
  overviewSheet['!cols'] = [
    { wch: 16 },
    { wch: 13 },
    { wch: 13 },
    { wch: 16 },
    { wch: 34 },
    { wch: 4 },
    { wch: 16 },
    { wch: 13 },
    { wch: 13 },
    { wch: 16 },
    { wch: 34 },
  ];
  XLSX.utils.book_append_sheet(workbook, overviewSheet, `${monthName} ${year}`.slice(0, 31));

  // Sheet 2 & 3: Dedicated V1 and UP sheets
  for (const company of ['V1', 'UP'] as const) {
    const companyRows: (string | number)[][] = [
      [`RELATÓRIO MENSAL — EMPRESA ${company} — ${monthName.toUpperCase()} / ${year}`],
      [],
    ];
    let companyGrandTotal = 0;

    for (let w = 1; w <= totalWeeks; w++) {
      const weekDoc = weeks[w];
      const statusLabel = weekDoc?.isLocked ? 'FECHADA' : 'ABERTA';
      const weekEntries = sortEntriesChronologically(
        entries.filter((e) => e.company === company && e.weekNumber === w),
      );
      const weekSum = weekDoc?.isLocked
        ? company === 'V1'
          ? weekDoc.lockedTotalV1
          : weekDoc.lockedTotalUP
        : weekEntries.reduce((acc, e) => acc + e.kmResult, 0);
      companyGrandTotal += weekSum;

      companyRows.push([`Semana ${w} (${statusLabel})`]);
      companyRows.push(['Data', 'KM Inicial', 'KM Final', 'Resultado (KM)', 'Descrição', 'Responsável']);
      if (weekEntries.length === 0) {
        companyRows.push(['Sem registros', '', '', 0, '', '']);
      } else {
        for (const item of weekEntries) {
          companyRows.push([
            item.dateDisplay,
            item.kmStart,
            item.kmEnd,
            item.kmResult,
            item.description,
            item.authorName,
          ]);
        }
      }
      companyRows.push([`Total Semana ${w} (${company})`, '', '', weekSum, '', '']);
      companyRows.push([]);
    }

    companyRows.push([`TOTAL ACUMULADO DO MÊS (${company})`, '', '', companyGrandTotal, '', '']);

    const companySheet = XLSX.utils.aoa_to_sheet(companyRows);
    companySheet['!cols'] = [
      { wch: 16 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 38 },
      { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(workbook, companySheet, `Tabela ${company}`);
  }

  const safeFileName = `Controle_KM_V1_UP_${monthName}_${year}.xlsx`;
  XLSX.writeFile(workbook, safeFileName);
}

interface GoogleSpreadsheetMetadata {
  spreadsheetId: string;
  spreadsheetUrl?: string;
  properties?: {
    title?: string;
  };
  sheets?: Array<{
    properties?: {
      sheetId?: number;
      title?: string;
    };
  }>;
}

/**
 * Creates a brand-new Google Sheets spreadsheet in the user's Google Drive
 * and populates the selected month's tab.
 */
export async function createAndSyncGoogleSpreadsheet(params: {
  accessToken: string;
  payload: MonthExportPayload;
}): Promise<{
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle: string;
  tabTitle: string;
}> {
  const { accessToken, payload } = params;
  const monthName = getMonthLabel(payload.month);
  const tabTitle = `${monthName} ${payload.year}`;
  const spreadsheetTitle = `Controle Corporativo KM V1 & UP — ${payload.year}`;

  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: spreadsheetTitle,
        locale: 'pt_BR',
      },
      sheets: [
        {
          properties: {
            title: tabTitle,
            gridProperties: {
              frozenRowCount: 1,
              columnCount: 12,
              rowCount: Math.max(buildMonthSheetMatrix(payload).length + 20, 60),
            },
          },
        },
      ],
    }),
  });

  if (!createRes.ok) {
    const errBody = await createRes.text();
    throw new Error(`Falha ao criar planilha no Google Sheets (${createRes.status}): ${errBody}`);
  }

  const created: GoogleSpreadsheetMetadata = await createRes.json();
  const spreadsheetId = created.spreadsheetId;
  const spreadsheetUrl =
    created.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  const sheetId = created.sheets?.[0]?.properties?.sheetId ?? 0;

  await writeMonthTabValuesAndFormat({
    accessToken,
    spreadsheetId,
    tabTitle,
    sheetId,
    payload,
  });

  return {
    spreadsheetId,
    spreadsheetUrl,
    spreadsheetTitle,
    tabTitle,
  };
}

/**
 * Syncs the selected month's data into an existing Google Sheets spreadsheet.
 * Always fetches spreadsheet metadata first instead of assuming tab names.
 */
export async function syncExistingGoogleSpreadsheet(params: {
  accessToken: string;
  spreadsheetId: string;
  payload: MonthExportPayload;
}): Promise<{
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle: string;
  tabTitle: string;
}> {
  const { accessToken, spreadsheetId, payload } = params;
  const monthName = getMonthLabel(payload.month);
  const tabTitle = `${monthName} ${payload.year}`;

  // 1. Fetch spreadsheet metadata first to inspect actual tabs
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!metaRes.ok) {
    if (metaRes.status === 404) {
      throw new Error(
        'A planilha vinculada não foi encontrada no Google Drive ou você não possui permissão de acesso a ela.',
      );
    }
    const errText = await metaRes.text();
    throw new Error(`Erro ao consultar planilha no Google Sheets (${metaRes.status}): ${errText}`);
  }

  const meta: GoogleSpreadsheetMetadata = await metaRes.json();
  const spreadsheetUrl =
    meta.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  const spreadsheetTitle =
    meta.properties?.title || `Controle Corporativo KM V1 & UP — ${payload.year}`;

  const existingTab = meta.sheets?.find((s) => s.properties?.title === tabTitle);
  let targetSheetId = existingTab?.properties?.sheetId;

  // 2. If month tab does not exist yet, create it dynamically via batchUpdate
  if (targetSheetId === undefined) {
    const addSheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: tabTitle,
                  gridProperties: {
                    frozenRowCount: 1,
                    columnCount: 12,
                    rowCount: Math.max(buildMonthSheetMatrix(payload).length + 20, 60),
                  },
                },
              },
            },
          ],
        }),
      },
    );

    if (!addSheetRes.ok) {
      const errText = await addSheetRes.text();
      throw new Error(`Erro ao criar aba "${tabTitle}" (${addSheetRes.status}): ${errText}`);
    }

    const addSheetData = await addSheetRes.json();
    targetSheetId = addSheetData.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
  } else {
    // Clear existing values in the month tab before writing fresh state
    const clearRange = `'${tabTitle.replace(/'/g, "''")}'!A1:L500`;
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(clearRange)}:clear`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );
  }

  await writeMonthTabValuesAndFormat({
    accessToken,
    spreadsheetId,
    tabTitle,
    sheetId: targetSheetId ?? 0,
    payload,
  });

  return {
    spreadsheetId,
    spreadsheetUrl,
    spreadsheetTitle,
    tabTitle,
  };
}

async function writeMonthTabValuesAndFormat(params: {
  accessToken: string;
  spreadsheetId: string;
  tabTitle: string;
  sheetId: number;
  payload: MonthExportPayload;
}): Promise<void> {
  const { accessToken, spreadsheetId, tabTitle, sheetId, payload } = params;
  const matrix = buildMonthSheetMatrix(payload);
  const escapedTab = `'${tabTitle.replace(/'/g, "''")}'!A1`;

  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(escapedTab)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: escapedTab,
        majorDimension: 'ROWS',
        values: matrix,
      }),
    },
  );

  if (!updateRes.ok) {
    const errText = await updateRes.text();
    throw new Error(`Falha ao gravar dados na planilha (${updateRes.status}): ${errText}`);
  }

  // Apply clean corporate column sizing and header styling
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: 11,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.07, green: 0.09, blue: 0.15 },
                  textFormat: {
                    foregroundColor: { red: 1, green: 1, blue: 1 },
                    bold: true,
                    fontSize: 12,
                  },
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)',
            },
          },
          {
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: 2,
                endRowIndex: 3,
                startColumnIndex: 0,
                endColumnIndex: 11,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.93, green: 0.96, blue: 1.0 },
                  textFormat: {
                    bold: true,
                  },
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)',
            },
          },
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: 11,
              },
            },
          },
        ],
      }),
    },
  );
}
