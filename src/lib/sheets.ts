import "server-only";

import { google } from "googleapis";
import { getEnv } from "@/lib/env";
import { format } from "date-fns";

export type SheetValues = string[][];

function getAuth() {
  const env = getEnv();
  return new google.auth.JWT({
    email: env.GOOGLE_SHEETS_CLIENT_EMAIL,
    key: env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
}

export async function getSheetValues(sheetName: string): Promise<SheetValues> {
  const env = getEnv();
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${sheetName}!A:Z`
  });
  return (res.data.values as string[][]) ?? [];
}

export function normalizeHeader(header: string) {
  return header.trim().replace(/\s+/g, " ");
}

export function getHeaderMap(values: SheetValues) {
  const headerRow = values[0] ?? [];
  const map = new Map<string, number>();
  headerRow.forEach((header, index) => {
    if (header) {
      map.set(normalizeHeader(header), index);
    }
  });
  return map;
}

export function findRowByDate(values: SheetValues, dateLabel: string) {
  return values.findIndex((row, idx) => idx > 0 && row[0] === dateLabel);
}

export function formatMonthLabel(date: Date) {
  return format(date, "MMM yyyy");
}

export async function updateRow(sheetName: string, rowIndex: number, row: string[]) {
  const env = getEnv();
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const rowNumber = rowIndex + 1;
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${sheetName}!A${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] }
  });
}

export async function appendRow(sheetName: string, row: string[]) {
  const env = getEnv();
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  await sheets.spreadsheets.values.append({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${sheetName}!A:Z`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] }
  });
}

function columnIndexToLetter(index: number) {
  let result = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

async function updateRowRange(sheetName: string, rowIndex: number, startCol: number, endCol: number, row: string[]) {
  const env = getEnv();
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const rowNumber = rowIndex + 1;
  const startLetter = columnIndexToLetter(startCol);
  const endLetter = columnIndexToLetter(endCol);
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${sheetName}!${startLetter}${rowNumber}:${endLetter}${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] }
  });
}

async function appendRowRange(sheetName: string, endCol: number, row: string[]) {
  const env = getEnv();
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const endLetter = columnIndexToLetter(endCol);
  await sheets.spreadsheets.values.append({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${sheetName}!A:${endLetter}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] }
  });
}

async function getSheetId(sheetName: string) {
  const env = getEnv();
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const res = await sheets.spreadsheets.get({ spreadsheetId: env.GOOGLE_SHEET_ID });
  const sheet = res.data.sheets?.find((s) => s.properties?.title === sheetName);
  if (!sheet?.properties?.sheetId) {
    throw new Error(`Sheet ${sheetName} not found`);
  }
  return sheet.properties.sheetId;
}

async function copyFormulaRange(sheetName: string, sourceRow: number, targetRow: number, startCol: number, endCol: number) {
  const env = getEnv();
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const sheetId = await getSheetId(sheetName);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    requestBody: {
      requests: [
        {
          copyPaste: {
            source: {
              sheetId,
              startRowIndex: sourceRow,
              endRowIndex: sourceRow + 1,
              startColumnIndex: startCol,
              endColumnIndex: endCol + 1
            },
            destination: {
              sheetId,
              startRowIndex: targetRow,
              endRowIndex: targetRow + 1,
              startColumnIndex: startCol,
              endColumnIndex: endCol + 1
            },
            pasteType: "PASTE_FORMULA"
          }
        }
      ]
    }
  });
}

export async function upsertMonthlyRow(
  sheetName: string,
  dateLabel: string,
  headerOrder: string[],
  data: Record<string, string | number | null>
) {
  const values = await getSheetValues(sheetName);
  const rowIndex = findRowByDate(values, dateLabel);
  const row = headerOrder.map((header, idx) => {
    if (idx === 0) return dateLabel;
    const normalized = normalizeHeader(header);
    const value = data[normalized] ?? data[header];
    return value === null || value === undefined ? "" : String(value);
  });

  if (rowIndex === -1) {
    await appendRow(sheetName, row);
    return { action: "append" as const };
  }

  await updateRow(sheetName, rowIndex, row);
  return { action: "update" as const };
}

export async function upsertMonthlyRowPartial(params: {
  sheetName: string;
  dateLabel: string;
  headerOrder: string[];
  data: Record<string, string | number | null>;
  maxRawIndex: number;
}) {
  const { sheetName, dateLabel, headerOrder, data, maxRawIndex } = params;
  const values = await getSheetValues(sheetName);
  const rowIndex = findRowByDate(values, dateLabel);
  const row = headerOrder.slice(0, maxRawIndex + 1).map((header, idx) => {
    if (idx === 0) return dateLabel;
    const normalized = normalizeHeader(header);
    const value = data[normalized] ?? data[header];
    return value === null || value === undefined ? "" : String(value);
  });

  if (rowIndex === -1) {
    await appendRowRange(sheetName, maxRawIndex, row);
    const newRowIndex = values.length;
    const computedStart = maxRawIndex + 1;
    const computedEnd = headerOrder.length - 1;
    if (computedStart <= computedEnd && newRowIndex > 1) {
      await copyFormulaRange(sheetName, newRowIndex - 1, newRowIndex, computedStart, computedEnd);
    }
    return { action: "append" as const };
  }

  await updateRowRange(sheetName, rowIndex, 0, maxRawIndex, row);
  const computedStart = maxRawIndex + 1;
  const computedEnd = headerOrder.length - 1;
  if (computedStart <= computedEnd && rowIndex > 1) {
    await copyFormulaRange(sheetName, rowIndex - 1, rowIndex, computedStart, computedEnd);
  }
  return { action: "update" as const };
}

export async function updateMetaWeight(survey: string, weight: number) {
  const values = await getSheetValues("Meta");
  const headerMap = getHeaderMap(values);
  const surveyIdx = headerMap.get("Survey") ?? 0;
  const weightIdx = headerMap.get("Weight");
  if (weightIdx === undefined) {
    throw new Error("Weight column not found in Meta tab");
  }

  const rowIndex = values.findIndex((row, idx) => idx > 0 && row[surveyIdx] === survey);
  if (rowIndex === -1) {
    throw new Error(`Survey ${survey} not found in Meta tab`);
  }

  const row = [...values[rowIndex]];
  row[weightIdx] = String(weight);
  await updateRow("Meta", rowIndex, row);
}

export async function getMetaWeights() {
  const values = await getSheetValues("Meta");
  const headerMap = getHeaderMap(values);
  const surveyIdx = headerMap.get("Survey") ?? 0;
  const weightIdx = headerMap.get("Weight");
  const meanIdx = headerMap.get("Mean");
  const stdevIdx = headerMap.get("Stdev");
  const directionIdx = headerMap.get("Direction");

  return values
    .slice(1)
    .map((row) => ({
      survey: row[surveyIdx],
      weight: weightIdx !== undefined ? toNumber(row[weightIdx]) : null,
      mean: meanIdx !== undefined ? toNumber(row[meanIdx]) : null,
      stdev: stdevIdx !== undefined ? toNumber(row[stdevIdx]) : null,
      direction: directionIdx !== undefined ? row[directionIdx] : null
    }))
    .filter((row) => row.survey && row.survey.trim().length > 0);
}

export async function getMetaStatsMap() {
  const entries = await getMetaWeights();
  const map = new Map<string, { mean: number | null; stdev: number | null }>();
  entries.forEach((entry) => {
    if (!entry.survey) return;
    map.set(normalizeHeader(entry.survey), { mean: entry.mean, stdev: entry.stdev });
  });
  return map;
}

function toNumber(value: string | undefined) {
  if (!value) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseNumber(value: string | undefined) {
  if (value === undefined || value === null) return null;
  const trimmed = value.toString().trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

export async function getOverviewData() {
  const dataValues = await getSheetValues("Data");
  const zValues = await getSheetValues("zscores");
  if (dataValues.length === 0 || zValues.length === 0) {
    return {
      indexSeries: [],
      zScoreSeries: [],
      latest: { indexScore: null, indexZ: null, percentile: null, date: null }
    };
  }

  const dataHeaders = getHeaderMap(dataValues);
  const zHeaders = getHeaderMap(zValues);
  const dataHeaderSet = new Set(Array.from(dataHeaders.keys()));

  const dateIdx = dataHeaders.get("DATE") ?? 0;
  const indexScoreIdx = dataHeaders.get("UNCERTAINTY INDEX");
  const percentileIdx = dataHeaders.get("INDEX PERCENTILE");

  const zDateIdx = zHeaders.get("DATE") ?? 0;
  const indexZIdx = zHeaders.get("INDEX (z score)");

  const indexSeries = dataValues.slice(1).map((row) => {
    const date = row[dateIdx];
    const indexScore = indexScoreIdx !== undefined ? parseNumber(row[indexScoreIdx]) : null;
    const percentile = percentileIdx !== undefined ? parseNumber(row[percentileIdx]) : null;
    const zRow = zValues.find((zRow) => zRow[zDateIdx] === date);
    const indexZ = zRow && indexZIdx !== undefined ? parseNumber(zRow[indexZIdx]) : null;

    return {
      date,
      indexScore,
      indexZ,
      percentile
    };
  });

  const zScoreSeries = Array.from(zHeaders.entries())
    .filter(([header]) => header !== "DATE" && !header.startsWith("INDEX"))
    .filter(([header]) => dataHeaderSet.has(header))
    .map(([header, idx]) => {
      const points = zValues.slice(1).map((row) => {
        const value = parseNumber(row[idx]);
        return {
          date: row[zDateIdx],
          value
        };
      });
      return { name: header, points };
    });

  const latest = indexSeries[indexSeries.length - 1];

  return {
    indexSeries,
    zScoreSeries,
    latest: {
      indexScore: latest?.indexScore ?? null,
      indexZ: latest?.indexZ ?? null,
      percentile: latest?.percentile ?? null,
      date: latest?.date ?? null
    }
  };
}

export async function getLatestDataRowMap() {
  const values = await getSheetValues("Data");
  const headers = values[0] ?? [];
  let lastRow: string[] = [];
  for (let i = values.length - 1; i >= 1; i -= 1) {
    if (values[i] && values[i][0]) {
      lastRow = values[i];
      break;
    }
  }
  if (!lastRow.length) {
    lastRow = values[values.length - 1] ?? [];
  }
  const map: Record<string, string> = {};
  headers.forEach((header, idx) => {
    if (header) {
      map[normalizeHeader(header)] = lastRow[idx] ?? "";
    }
  });
  return map;
}

export async function buildEmptyRowForMonth(dateLabel: string) {
  const values = await getSheetValues("Data");
  const headers = values[0] ?? [];
  const row: Record<string, string | number | null> = {};
  headers.forEach((header, idx) => {
    if (idx === 0) return;
    row[header] = null;
  });
  row[headers[0] ?? "DATE"] = dateLabel;
  return { headers, row };
}

export async function getZScoresForMonths(monthLabels: string[]) {
  const values = await getSheetValues("zscores");
  const headers = values[0] ?? [];
  const dateIdx = headers.findIndex((h) => normalizeHeader(h) === "DATE");
  const headerNames = headers.map((h) => normalizeHeader(h));
  const map = new Map<string, Record<string, number | null>>();

  values.slice(1).forEach((row) => {
    const date = row[dateIdx] ?? "";
    if (!date || !monthLabels.includes(date)) return;
    const record: Record<string, number | null> = {};
    headerNames.forEach((header, idx) => {
      if (!header || header === "DATE") return;
      record[header] = parseNumber(row[idx]);
    });
    map.set(date, record);
  });

  return map;
}
