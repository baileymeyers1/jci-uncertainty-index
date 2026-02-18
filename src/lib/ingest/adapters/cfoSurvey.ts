import "server-only";

import * as XLSX from "xlsx";

const CFO_DATA_URL =
  "https://www.richmondfed.org/-/media/RichmondFedOrg/research/national_economy/cfo_survey/current_historical_cfo_data.xlsx";

const CFO_SHEETS = [
  {
    name: "through_Q1_2020",
    columns: {
      year: "year",
      quarter: "quarter",
      economy: "opt_rating_econ",
      ownFirm: "opt_rating_own"
    }
  },
  {
    name: "CFO_optimism_all",
    columns: {
      year: "year",
      quarter: "quarter",
      economy: "economy_mean",
      ownFirm: "ownfirm_mean"
    }
  }
];

let cachedData: Array<{ date: Date; economy: number; ownFirm: number }> | null = null;

export async function getCfoSurveyValues() {
  if (cachedData) return cachedData;

  const res = await fetch(CFO_DATA_URL);
  if (!res.ok) {
    throw new Error(`CFO survey download failed (${res.status})`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

  const rowsByDate = new Map<number, { date: Date; economy: number; ownFirm: number }>();

  for (const sheetSpec of CFO_SHEETS) {
    const sheet = workbook.Sheets[sheetSpec.name];
    if (!sheet) continue;

    const data = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: null
    }) as Array<Array<unknown>>;

    const headerRowIndex = data.findIndex((row) =>
      row.some((cell) => typeof cell === "string" && cell.toLowerCase() === sheetSpec.columns.year)
    );

    if (headerRowIndex === -1) continue;

    const headerRow = data[headerRowIndex].map((cell) =>
      typeof cell === "string" ? cell.toLowerCase() : cell
    );
    const yearIdx = headerRow.findIndex((cell) => cell === sheetSpec.columns.year);
    const quarterIdx = headerRow.findIndex((cell) => cell === sheetSpec.columns.quarter);
    const economyIdx = headerRow.findIndex((cell) => cell === sheetSpec.columns.economy);
    const ownFirmIdx = headerRow.findIndex((cell) => cell === sheetSpec.columns.ownFirm);

    if ([yearIdx, quarterIdx, economyIdx, ownFirmIdx].some((idx) => idx === -1)) continue;

    data.slice(headerRowIndex + 1).forEach((row) => {
      const year = Number(row[yearIdx]);
      const quarter = normalizeQuarter(row[quarterIdx]);
      const economy = Number(row[economyIdx]);
      const ownFirm = Number(row[ownFirmIdx]);
      if (!Number.isFinite(year) || !Number.isFinite(quarter)) return;
      if (!Number.isFinite(economy) || !Number.isFinite(ownFirm)) return;

      const date = quarterEndDate(year, quarter);
      rowsByDate.set(date.getTime(), { date, economy, ownFirm });
    });
  }

  cachedData = Array.from(rowsByDate.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
  return cachedData;
}

export async function getLatestCfoValue(targetMonth: Date) {
  const data = await getCfoSurveyValues();
  const cutoff = endOfMonth(targetMonth);
  const candidates = data.filter((row) => row.date <= cutoff);
  if (!candidates.length) return null;
  return candidates[candidates.length - 1];
}

function quarterEndDate(year: number, quarter: number) {
  const month = quarter === 1 ? 2 : quarter === 2 ? 5 : quarter === 3 ? 8 : 11;
  return new Date(year, month + 1, 0);
}

function normalizeQuarter(value: unknown) {
  if (typeof value === "number") {
    return value >= 1 && value <= 4 ? value : NaN;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const numeric = Number(trimmed.replace(/[^0-9]/g, ""));
    if (!Number.isFinite(numeric)) return NaN;
    return numeric >= 1 && numeric <= 4 ? numeric : NaN;
  }
  return NaN;
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}
