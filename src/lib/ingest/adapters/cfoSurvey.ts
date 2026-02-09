import "server-only";

import * as XLSX from "xlsx";

const CFO_DATA_URL =
  "https://www.richmondfed.org/-/media/RichmondFedOrg/research/national_economy/cfo_survey/current_historical_cfo_data.xlsx";

let cachedData: Array<{ date: Date; economy: number; ownFirm: number }> | null = null;

export async function getCfoSurveyValues() {
  if (cachedData) return cachedData;

  const res = await fetch(CFO_DATA_URL);
  if (!res.ok) {
    throw new Error(`CFO survey download failed (${res.status})`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

  const rows: Array<{ date: Date; economy: number; ownFirm: number }> = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const data = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: null
    }) as Array<Array<unknown>>;

    const headerRowIndex = data.findIndex((row) =>
      row.some((cell) => typeof cell === "string" && cell.toLowerCase().includes("economy_mean"))
    );

    if (headerRowIndex === -1) continue;

    const headerRow = data[headerRowIndex];
    const yearIdx = headerRow.findIndex((cell) => typeof cell === "string" && cell.toLowerCase() === "year");
    const quarterIdx = headerRow.findIndex((cell) => typeof cell === "string" && cell.toLowerCase() === "quarter");
    const economyIdx = headerRow.findIndex((cell) => typeof cell === "string" && cell.toLowerCase() === "economy_mean");
    const ownFirmIdx = headerRow.findIndex((cell) => typeof cell === "string" && cell.toLowerCase() === "ownfirm_mean");

    if ([yearIdx, quarterIdx, economyIdx, ownFirmIdx].some((idx) => idx === -1)) continue;

    data.slice(headerRowIndex + 1).forEach((row) => {
      const year = Number(row[yearIdx]);
      const quarter = Number(row[quarterIdx]);
      const economy = Number(row[economyIdx]);
      const ownFirm = Number(row[ownFirmIdx]);
      if (!Number.isFinite(year) || !Number.isFinite(quarter)) return;
      if (!Number.isFinite(economy) || !Number.isFinite(ownFirm)) return;

      const date = quarterEndDate(year, quarter);
      rows.push({ date, economy, ownFirm });
    });
  }

  cachedData = rows.sort((a, b) => a.date.getTime() - b.date.getTime());
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

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}
