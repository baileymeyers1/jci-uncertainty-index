import "server-only";

import { google } from "googleapis";
import { getEnv } from "@/lib/env";
import { format, parse, isValid } from "date-fns";

export type SheetValues = string[][];

function getAuth() {
  const env = getEnv();
  const rawKey = env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/^"+|"+$/g, "");
  return new google.auth.JWT({
    email: env.GOOGLE_SHEETS_CLIENT_EMAIL,
    key: rawKey.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
}

export async function getSheetValues(sheetName: string): Promise<SheetValues> {
  const env = getEnv();
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${sheetName}!A:AZ`
  });
  return (res.data.values as string[][]) ?? [];
}

export function normalizeHeader(header: string) {
  return header.trim().replace(/\s+/g, " ");
}

function normalizeSheetName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
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

function parseDateLabel(label: string | undefined | null) {
  if (!label) return null;
  const trimmed = label.toString().trim();
  if (!trimmed) return null;
  const parsedMonth = parse(trimmed, "MMM yyyy", new Date());
  if (isValid(parsedMonth)) return parsedMonth;
  const parsed = new Date(trimmed);
  if (isValid(parsed)) return parsed;
  return null;
}

function toMonthKey(label: string | undefined | null) {
  const parsed = parseDateLabel(label);
  if (parsed) return format(parsed, "MMM yyyy");
  return label ? label.toString().trim() : "";
}

function compareMonthLabels(a: string, b: string) {
  const aDate = parseDateLabel(a);
  const bDate = parseDateLabel(b);
  if (aDate && bDate) return aDate.getTime() - bDate.getTime();
  if (aDate && !bDate) return -1;
  if (!aDate && bDate) return 1;
  return a.localeCompare(b);
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
    range: `${sheetName}!A:AZ`,
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
  const target = normalizeSheetName(sheetName);
  const sheet = res.data.sheets?.find(
    (s) => normalizeSheetName(s.properties?.title ?? "") === target
  );
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) {
    throw new Error(`Sheet ${sheetName} not found`);
  }
  return sheetId;
}

export async function sortSheetByDate(sheetName: string) {
  const env = getEnv();
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const values = await getSheetValues(sheetName);
  if (values.length <= 2) return;
  const sheetId = await getSheetId(sheetName);
  const rowCount = values.length;
  const colCount = values[0]?.length ?? 1;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    requestBody: {
      requests: [
        {
          sortRange: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: rowCount,
              startColumnIndex: 0,
              endColumnIndex: colCount
            },
            sortSpecs: [{ dimensionIndex: 0, sortOrder: "ASCENDING" }]
          }
        }
      ]
    }
  });
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
      try {
        await copyFormulaRange(sheetName, newRowIndex - 1, newRowIndex, computedStart, computedEnd);
      } catch (error) {
        console.error("Formula copy failed", error);
      }
    }
    return { action: "append" as const };
  }

  await updateRowRange(sheetName, rowIndex, 0, maxRawIndex, row);
  const computedStart = maxRawIndex + 1;
  const computedEnd = headerOrder.length - 1;
  if (computedStart <= computedEnd && rowIndex > 1) {
    try {
      await copyFormulaRange(sheetName, rowIndex - 1, rowIndex, computedStart, computedEnd);
    } catch (error) {
      console.error("Formula copy failed", error);
    }
  }
  return { action: "update" as const };
}

export async function patchMonthlyRowPartial(params: {
  sheetName: string;
  dateLabel: string;
  data: Record<string, string | number | null>;
  maxRawIndex?: number;
}) {
  const { sheetName, dateLabel, data } = params;
  const values = await getSheetValues(sheetName);
  const headers = values[0] ?? [];
  const headerMap = getHeaderMap(values);
  const maxRawIndex =
    params.maxRawIndex ??
    (() => {
      const indexCol = headers.findIndex((header) => normalizeHeader(header) === "UNCERTAINTY INDEX");
      return indexCol > 0 ? indexCol - 1 : headers.length - 1;
    })();

  let rowIndex = findRowByDate(values, dateLabel);
  const row: string[] = new Array(maxRawIndex + 1).fill("");

  if (rowIndex !== -1) {
    const existing = values[rowIndex] ?? [];
    for (let i = 0; i <= maxRawIndex; i += 1) {
      row[i] = existing[i] ?? "";
    }
  }

  row[0] = dateLabel;
  Object.entries(data).forEach(([key, value]) => {
    const normalized = normalizeHeader(key);
    const idx = headerMap.get(normalized);
    if (idx === undefined || idx > maxRawIndex) return;
    row[idx] = value === null || value === undefined ? "" : String(value);
  });

  if (rowIndex === -1) {
    await appendRowRange(sheetName, maxRawIndex, row);
    const newRowIndex = values.length;
    const computedStart = maxRawIndex + 1;
    const computedEnd = headers.length - 1;
    if (computedStart <= computedEnd && newRowIndex > 1) {
      try {
        await copyFormulaRange(sheetName, newRowIndex - 1, newRowIndex, computedStart, computedEnd);
      } catch (error) {
        console.error("Formula copy failed", error);
      }
    }
    rowIndex = newRowIndex;
  } else {
    await updateRowRange(sheetName, rowIndex, 0, maxRawIndex, row);
  }

  return { action: rowIndex === -1 ? "append" : "update" };
}

export async function ensureZScoreRow(dateLabel: string) {
  const values = await getSheetValues("zscores");
  if (!values.length) return { action: "noop" as const };
  const headers = values[0] ?? [];
  if (!headers.length) return { action: "noop" as const };

  const dateIdx = headers.findIndex((h) => normalizeHeader(h) === "DATE");
  const rowIndex = findRowByDate(values, dateLabel);
  if (rowIndex !== -1) return { action: "exists" as const };

  const dateCol = dateIdx === -1 ? 0 : dateIdx;
  const row = new Array(headers.length).fill("");
  row[dateCol] = dateLabel;
  await appendRowRange("zscores", headers.length - 1, row);

  const newRowIndex = values.length;
  const formulaStart = dateCol + 1;
  const formulaEnd = headers.length - 1;
  if (formulaStart <= formulaEnd && newRowIndex > 1) {
    try {
      await copyFormulaRange("zscores", newRowIndex - 1, newRowIndex, formulaStart, formulaEnd);
    } catch (error) {
      console.error("Formula copy failed", error);
    }
  }

  return { action: "append" as const };
}

export async function syncZScoreDatesFromData() {
  const dataValues = await getSheetValues("Data");
  const zValues = await getSheetValues("zscores");
  if (!dataValues.length || !zValues.length) {
    return { added: 0 };
  }

  const dataHeaders = dataValues[0] ?? [];
  const zHeaders = zValues[0] ?? [];
  if (!dataHeaders.length || !zHeaders.length) {
    return { added: 0 };
  }

  const dataDateIdx = dataHeaders.findIndex((h) => normalizeHeader(h) === "DATE");
  const zDateIdx = zHeaders.findIndex((h) => normalizeHeader(h) === "DATE");
  if (dataDateIdx === -1) {
    return { added: 0 };
  }

  const zDateCol = zDateIdx === -1 ? 0 : zDateIdx;
  const existingKeys = new Set<string>();
  zValues.slice(1).forEach((row) => {
    const key = toMonthKey(row[zDateCol] ?? "");
    if (key) existingKeys.add(key);
  });

  let added = 0;
  let zRowCount = zValues.length;

  for (const row of dataValues.slice(1)) {
    const label = row[dataDateIdx];
    if (!label) continue;
    const key = toMonthKey(label);
    if (!key || existingKeys.has(key)) continue;

    const newRow = new Array(zHeaders.length).fill("");
    newRow[zDateCol] = label;
    await appendRowRange("zscores", zHeaders.length - 1, newRow);
    const newRowIndex = zRowCount;
    zRowCount += 1;

    const formulaStart = zDateCol + 1;
    const formulaEnd = zHeaders.length - 1;
    if (formulaStart <= formulaEnd && newRowIndex > 1) {
      try {
        await copyFormulaRange("zscores", newRowIndex - 1, newRowIndex, formulaStart, formulaEnd);
      } catch (error) {
        console.error("Formula copy failed", error);
      }
    }

    existingKeys.add(key);
    added += 1;
  }

  if (added > 0) {
    try {
      await sortSheetByDate("zscores");
    } catch (error) {
      console.error("Failed to sort zscores sheet", error);
    }
  }

  return { added };
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
  const dataHeaderLowerSet = new Set(Array.from(dataHeaders.keys()).map((header) => header.toLowerCase()));
  const dataHeaderLowerMap = new Map<string, number>();
  dataHeaders.forEach((idx, key) => {
    dataHeaderLowerMap.set(key.toLowerCase(), idx);
  });

  const dateKey = normalizeHeader("DATE");
  const dateIdx = dataHeaders.get(dateKey) ?? dataHeaderLowerMap.get(dateKey.toLowerCase()) ?? 0;
  const indexScoreKey = normalizeHeader("UNCERTAINTY INDEX");
  const indexScoreIdx = dataHeaders.get(indexScoreKey) ?? dataHeaderLowerMap.get(indexScoreKey.toLowerCase());
  const percentileKey = normalizeHeader("INDEX PERCENTILE");
  const percentileIdx = dataHeaders.get(percentileKey) ?? dataHeaderLowerMap.get(percentileKey.toLowerCase());

  const zHeaderLowerMap = new Map<string, number>();
  zHeaders.forEach((idx, key) => {
    zHeaderLowerMap.set(key.toLowerCase(), idx);
  });
  const zDateIdx = zHeaders.get(dateKey) ?? zHeaderLowerMap.get(dateKey.toLowerCase()) ?? 0;
  const indexZKey = normalizeHeader("INDEX (z score)");
  const indexZIdx =
    zHeaders.get(indexZKey) ??
    zHeaderLowerMap.get(indexZKey.toLowerCase()) ??
    (() => {
      for (const [header, idx] of zHeaders.entries()) {
        const normalized = header.toLowerCase();
        if (normalized.includes("index") && normalized.includes("z")) {
          return idx;
        }
      }
      return undefined;
    })() ??
    (zValues[0] && zValues[0].length > 15 ? 15 : undefined);

  const dataRows = dataValues.slice(1).filter((row) => row[dateIdx]);
  const zRows = zValues.slice(1).filter((row) => row[zDateIdx]);
  const zRowMap = new Map<string, string[]>();
  zRows.forEach((row) => {
    const key = toMonthKey(row[zDateIdx]);
    if (key) {
      zRowMap.set(key, row);
    }
  });

  const indexSeries = dataRows.map((row) => {
    const date = row[dateIdx];
    const monthKey = toMonthKey(date);
    const indexScore = indexScoreIdx !== undefined ? parseNumber(row[indexScoreIdx]) : null;
    const percentile = percentileIdx !== undefined ? parseNumber(row[percentileIdx]) : null;
    const zRow = zRowMap.get(monthKey);
    const indexZ = zRow && indexZIdx !== undefined ? parseNumber(zRow[indexZIdx]) : null;

    return {
      date,
      indexScore,
      indexZ,
      percentile
    };
  });

  const zScoreSeries = Array.from(zHeaders.entries())
    .filter(([header]) => {
      const normalized = header.toUpperCase();
      return normalized !== "DATE" && !normalized.startsWith("INDEX");
    })
    .map(([header, idx]) => {
      const points = zRows.map((row) => {
        const value = parseNumber(row[idx]);
        return {
          date: toMonthKey(row[zDateIdx]),
          value
        };
      });
      return { name: header, points };
    });

  const sortedIndexSeries = [...indexSeries].sort((a, b) => compareMonthLabels(a.date, b.date));
  const sortedZScoreSeries = zScoreSeries.map((series) => ({
    ...series,
    points: [...series.points].sort((a, b) => compareMonthLabels(a.date, b.date))
  }));

  const rawScoreSeries = sortedZScoreSeries
    .map((series) => {
      const dataIndex = dataHeaders.get(series.name) ?? dataHeaderLowerMap.get(series.name.toLowerCase()) ?? null;
      if (dataIndex === null || dataIndex === undefined) {
        return { name: series.name, points: [] as { date: string; value: number | null }[] };
      }
      const points = dataRows.map((row) => ({
        date: toMonthKey(row[dateIdx]),
        value: parseNumber(row[dataIndex])
      }));
      return {
        name: series.name,
        points: points.sort((a, b) => compareMonthLabels(a.date, b.date))
      };
    })
    .filter((series) => series.points.length);

  const latest = sortedIndexSeries.length ? sortedIndexSeries[sortedIndexSeries.length - 1] : null;

  return {
    indexSeries: sortedIndexSeries,
    zScoreSeries: sortedZScoreSeries,
    rawScoreSeries,
    latest: {
      indexScore: latest ? latest.indexScore : null,
      indexZ: latest ? latest.indexZ : null,
      percentile: latest ? latest.percentile : null,
      date: latest ? latest.date : null
    }
  };
}

export async function getLatestDataRowMap() {
  const values = await getSheetValues("Data");
  const headers = values[0] ?? [];
  const dateIdx = headers.findIndex((h) => normalizeHeader(h) === "DATE");
  let lastRow: string[] = [];
  let lastDate: Date | null = null;
  for (let i = 1; i < values.length; i += 1) {
    const row = values[i];
    if (!row || !row[dateIdx]) continue;
    const parsed = parseDateLabel(row[dateIdx]);
    if (!parsed) continue;
    if (!lastDate || parsed > lastDate) {
      lastDate = parsed;
      lastRow = row;
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

export async function getLatestDataRowMapForMonth(targetMonth?: Date) {
  if (!targetMonth) return getLatestDataRowMap();
  const values = await getSheetValues("Data");
  const headers = values[0] ?? [];
  const dateIdx = headers.findIndex((h) => normalizeHeader(h) === "DATE");
  const cutoff = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);
  let bestRow: string[] = [];
  let bestDate: Date | null = null;
  for (let i = 1; i < values.length; i += 1) {
    const row = values[i];
    if (!row || !row[dateIdx]) continue;
    const parsed = parseDateLabel(row[dateIdx]);
    if (!parsed || parsed > cutoff) continue;
    if (!bestDate || parsed > bestDate) {
      bestDate = parsed;
      bestRow = row;
    }
  }
  if (!bestRow.length) {
    return getLatestDataRowMap();
  }
  const map: Record<string, string> = {};
  headers.forEach((header, idx) => {
    if (header) {
      map[normalizeHeader(header)] = bestRow[idx] ?? "";
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
  const targetKeys = new Set(monthLabels.map((label) => toMonthKey(label)));

  values.slice(1).forEach((row) => {
    const dateKey = toMonthKey(row[dateIdx] ?? "");
    if (!dateKey || !targetKeys.has(dateKey)) return;
    const record: Record<string, number | null> = {};
    headerNames.forEach((header, idx) => {
      if (!header || header === "DATE") return;
      record[header] = parseNumber(row[idx]);
    });
    map.set(dateKey, record);
  });

  return map;
}

export async function getLatestZScoreRowMap() {
  const values = await getSheetValues("zscores");
  const headers = values[0] ?? [];
  const dateIdx = headers.findIndex((h) => normalizeHeader(h) === "DATE");
  let lastRow: string[] = [];
  let lastDate: Date | null = null;
  for (let i = 1; i < values.length; i += 1) {
    const row = values[i];
    if (!row || !row[dateIdx]) continue;
    const parsed = parseDateLabel(row[dateIdx]);
    if (!parsed) continue;
    if (!lastDate || parsed > lastDate) {
      lastDate = parsed;
      lastRow = row;
    }
  }
  const map: Record<string, number | null> = {};
  headers.forEach((header, idx) => {
    if (!header || normalizeHeader(header) === "DATE") return;
    map[normalizeHeader(header)] = parseNumber(lastRow[idx]);
  });
  return map;
}
