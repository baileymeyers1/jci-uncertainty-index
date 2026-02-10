import "server-only";

import * as XLSX from "xlsx";
import { endOfMonth, subMonths } from "date-fns";

const SCE_DATA_URL =
  "https://www.newyorkfed.org/medialibrary/interactives/sce/sce/downloads/data/frbny-sce-data.xlsx?sc_lang=en";
const INFLATION_SHEET = "Inflation expectations";
const TARGET_LABEL = "Median one-year ahead expected inflation rate";

let cachedInflationSeries: Array<{ date: Date; value: number }> | null = null;

export async function getNyFedInflationMedian(targetMonth: Date) {
  const data = await getInflationSeries();
  if (!data.length) return null;
  const cutoff = endOfMonth(subMonths(targetMonth, 1));
  const candidates = data.filter((row) => row.date <= cutoff);
  if (!candidates.length) return null;
  return candidates[candidates.length - 1];
}

async function getInflationSeries() {
  if (cachedInflationSeries) return cachedInflationSeries;

  const res = await fetch(SCE_DATA_URL);
  if (!res.ok) {
    throw new Error(`NY Fed SCE download failed (${res.status})`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[INFLATION_SHEET];
  if (!sheet) {
    throw new Error(`NY Fed SCE sheet not found: ${INFLATION_SHEET}`);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null
  }) as Array<Array<unknown>>;

  const headerRowIndex = rows.findIndex((row) =>
    row.some(
      (cell) =>
        typeof cell === "string" &&
        cell.toLowerCase().includes("median one-year ahead expected inflation rate")
    )
  );

  if (headerRowIndex === -1) {
    throw new Error("NY Fed SCE header row not found");
  }

  const headerRow = rows[headerRowIndex];
  let dateIdx = headerRow.findIndex(
    (cell) => typeof cell === "string" && cell.toLowerCase() === "date"
  );
  if (dateIdx === -1) {
    dateIdx = 0;
  }

  let valueIdx = headerRow.findIndex(
    (cell) => typeof cell === "string" && cell.toLowerCase() === TARGET_LABEL.toLowerCase()
  );
  if (valueIdx === -1) {
    valueIdx = headerRow.findIndex(
      (cell) =>
        typeof cell === "string" &&
        cell.toLowerCase().includes("median") &&
        cell.toLowerCase().includes("one-year")
    );
  }

  if (valueIdx === -1) {
    throw new Error("NY Fed SCE median one-year ahead column not found");
  }

  const observations = rows.slice(headerRowIndex + 1);
  const pairs = observations
    .map((row) => {
      const date = normalizeDate(row[dateIdx]);
      const value = toNumber(row[valueIdx]);
      return date && value !== null ? { date, value } : null;
    })
    .filter(Boolean) as Array<{ date: Date; value: number }>;

  cachedInflationSeries = pairs.sort((a, b) => a.date.getTime() - b.date.getTime());
  return cachedInflationSeries;
}

function normalizeDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const year = Math.floor(value / 100);
    const month = value % 100;
    if (year > 1900 && month >= 1 && month <= 12) {
      return new Date(year, month - 1, 1);
    }
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(parsed.y, parsed.m - 1, parsed.d || 1);
    }
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\\d{6}$/.test(trimmed)) {
      const year = Number(trimmed.slice(0, 4));
      const month = Number(trimmed.slice(4, 6));
      if (Number.isFinite(year) && Number.isFinite(month)) {
        return new Date(year, month - 1, 1);
      }
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "");
    const numeric = Number(cleaned);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}
