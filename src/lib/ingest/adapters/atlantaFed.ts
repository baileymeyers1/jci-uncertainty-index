import "server-only";

import * as XLSX from "xlsx";
import { endOfMonth } from "date-fns";

const SBU_DATA_URL =
  "https://www.atlantafed.org/-/media/Project/Atlanta/FRBA/Documents/datafiles/research/surveys/business-uncertainty/sbu-data.xlsx";

export async function getSbuSeriesValue(params: {
  targetMonth: Date;
  series: "empgrowth" | "revgrowth";
}) {
  const res = await fetch(SBU_DATA_URL);
  if (!res.ok) {
    throw new Error(`SBU download failed (${res.status})`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

  const keywords =
    params.series === "empgrowth"
      ? ["empgrowth", "employment", "emp growth", "employment growth"]
      : ["revgrowth", "revenue", "rev growth", "revenue growth"];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: null
    }) as Array<Array<unknown>>;

    const headerInfo = findHeaderRow(rows, keywords);
    if (!headerInfo) continue;

    const { headerRowIndex, dateCol, valueCol } = headerInfo;
    const observations = rows.slice(headerRowIndex + 1);

    const pairs = observations
      .map((row) => {
        const date = normalizeDate(row[dateCol]);
        const value = toNumber(row[valueCol]);
        return date && Number.isFinite(value) ? { date, value: value as number } : null;
      })
      .filter(Boolean) as { date: Date; value: number }[];

    if (!pairs.length) continue;

    const cutoff = endOfMonth(params.targetMonth);
    const sorted = pairs
      .filter((pair) => pair.date <= cutoff)
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    if (sorted.length) {
      return { value: sorted[0].value, date: sorted[0].date, sourceSheet: sheetName };
    }
  }

  return null;
}

function findHeaderRow(rows: Array<Array<unknown>>, keywords: string[]) {
  for (let i = 0; i < Math.min(rows.length, 50); i += 1) {
    const row = rows[i] ?? [];
    const dateCol = row.findIndex((cell) =>
      typeof cell === "string" ? cell.toLowerCase().includes("date") || cell.toLowerCase().includes("month") : false
    );

    if (dateCol === -1) continue;

    const valueCol = row.findIndex((cell) => {
      if (typeof cell !== "string") return false;
      const text = cell.toLowerCase();
      return keywords.some((keyword) => text.includes(keyword));
    });

    if (valueCol !== -1) {
      return { headerRowIndex: i, dateCol, valueCol };
    }
  }

  return null;
}

function normalizeDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      return new Date(date.y, date.m - 1, date.d || 1);
    }
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "");
    const numeric = Number(cleaned);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}
