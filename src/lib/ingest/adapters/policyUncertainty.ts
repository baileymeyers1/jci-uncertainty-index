import * as XLSX from "xlsx";
import { endOfMonth } from "date-fns";
import { resolvePreviousPublishedMonth } from "../../month";

const POLICY_UNCERTAINTY_XLSX_URL =
  "https://www.policyuncertainty.com/media/US_Policy_Uncertainty_Data.xlsx";
const MAIN_SHEET = "Main News Index";

export interface PolicyUncertaintyRow {
  year: number;
  month: number;
  value: number;
}

let cachedRows: PolicyUncertaintyRow[] | null = null;

function toNumeric(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const numeric = Number(value.trim());
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

export function parsePolicyUncertaintyRows(rows: Array<Array<unknown>>) {
  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => typeof cell === "string" && cell.toLowerCase().includes("news_based_policy_uncert"))
  );
  if (headerIndex === -1) {
    throw new Error("Policy uncertainty header row not found");
  }

  const headerRow = rows[headerIndex];
  const yearIdx = headerRow.findIndex(
    (cell) => typeof cell === "string" && cell.toLowerCase().trim() === "year"
  );
  const monthIdx = headerRow.findIndex(
    (cell) => typeof cell === "string" && cell.toLowerCase().trim() === "month"
  );
  const valueIdx = headerRow.findIndex(
    (cell) =>
      typeof cell === "string" &&
      cell.toLowerCase().includes("news_based_policy_uncert_index")
  );

  if (yearIdx === -1 || monthIdx === -1 || valueIdx === -1) {
    throw new Error("Policy uncertainty columns not found");
  }

  return rows
    .slice(headerIndex + 1)
    .map((row) => {
      const year = toNumeric(row[yearIdx]);
      const month = toNumeric(row[monthIdx]);
      const value = toNumeric(row[valueIdx]);
      if (!year || !month || !value) return null;
      if (month < 1 || month > 12) return null;
      return {
        year: Math.trunc(year),
        month: Math.trunc(month),
        value
      };
    })
    .filter(Boolean) as PolicyUncertaintyRow[];
}

export function selectPolicyUncertaintyValueForTargetMonth(
  rows: PolicyUncertaintyRow[],
  targetMonth: Date
) {
  const targetReleaseMonth = resolvePreviousPublishedMonth(targetMonth);
  const year = targetReleaseMonth.getFullYear();
  const month = targetReleaseMonth.getMonth() + 1;
  return rows.find((row) => row.year === year && row.month === month) ?? null;
}

async function getPolicyUncertaintyRows() {
  if (cachedRows) return cachedRows;

  const res = await fetch(POLICY_UNCERTAINTY_XLSX_URL);
  if (!res.ok) {
    throw new Error(`Policy uncertainty XLSX download failed (${res.status})`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[MAIN_SHEET];
  if (!sheet) {
    throw new Error(`Policy uncertainty sheet not found: ${MAIN_SHEET}`);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null
  }) as Array<Array<unknown>>;

  cachedRows = parsePolicyUncertaintyRows(rows);
  return cachedRows;
}

export async function getPolicyUncertaintyMonthlyValue(targetMonth: Date) {
  const rows = await getPolicyUncertaintyRows();
  const selected = selectPolicyUncertaintyValueForTargetMonth(rows, targetMonth);
  if (!selected) return null;

  return {
    value: selected.value,
    year: selected.year,
    month: selected.month,
    date: endOfMonth(new Date(selected.year, selected.month - 1, 1))
  };
}
