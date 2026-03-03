import { PrismaClient } from "@prisma/client";
import { google } from "googleapis";

const prisma = new PrismaClient();

const TARGET_MONTHS = ["Nov 2025", "Dec 2025", "Jan 2026", "Feb 2026"] as const;

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/\bavg\b/g, "average")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function toNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function nearlyEqual(a: number | null, b: number | null, tolerance = 1e-8) {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) <= tolerance;
}

async function loadDataSheetRows() {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!clientEmail || !privateKey || !sheetId) {
    throw new Error("Missing Google Sheets configuration in environment");
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "Data!A:AZ"
  });
  const values = (res.data.values ?? []) as string[][];
  const header = values[0] ?? [];
  const dateIdx = header.findIndex((name) => String(name).trim().toUpperCase() === "DATE");
  if (dateIdx < 0) {
    throw new Error("DATE column not found in Data sheet");
  }

  const headerIndex = new Map<string, number>();
  header.forEach((name, idx) => {
    const normalized = normalize(String(name ?? ""));
    if (!normalized) return;
    if (!headerIndex.has(normalized)) {
      headerIndex.set(normalized, idx);
    }
  });

  const rowsByMonth = new Map<string, string[]>();
  values.slice(1).forEach((row) => {
    const month = String(row[dateIdx] ?? "").trim();
    if (!month) return;
    rowsByMonth.set(month, row);
  });

  return { rowsByMonth, headerIndex };
}

function resolveColumnIndex(
  sourceName: string,
  headerIndex: Map<string, number>
) {
  const sourceKey = normalize(sourceName);
  const direct = headerIndex.get(sourceKey);
  if (direct !== undefined) return direct;

  const fallbackKey = sourceKey
    .replace("( month average )", "( month avg )")
    .replace(" month average ", " month avg ");
  const fallback = headerIndex.get(fallbackKey);
  if (fallback !== undefined) return fallback;

  const fuzzy = Array.from(headerIndex.entries()).find(
    ([key]) => key.startsWith(sourceKey) || sourceKey.startsWith(key)
  );
  return fuzzy?.[1];
}

async function latestRunByMonth(month: string) {
  return prisma.ingestRun.findFirst({
    where: { month, status: "SUCCESS" },
    orderBy: { startedAt: "desc" },
    include: { sources: true }
  });
}

async function main() {
  const { rowsByMonth, headerIndex } = await loadDataSheetRows();
  const changes: Array<{
    month: string;
    sourceName: string;
    oldValue: number | null;
    newValue: number;
    oldStatus: string;
    newStatus: string;
  }> = [];

  for (const month of TARGET_MONTHS) {
    const run = await latestRunByMonth(month);
    if (!run) continue;

    const row = rowsByMonth.get(month);
    if (!row) continue;

    for (const source of run.sources) {
      const columnIdx = resolveColumnIndex(source.sourceName, headerIndex);
      if (columnIdx === undefined) continue;
      const sheetValue = toNumber(row[columnIdx]);
      if (sheetValue === null) continue;
      const carriesForwardMessage = (source.message ?? "")
        .toLowerCase()
        .includes("carried forward");
      const needsStatusRepair =
        source.status !== "success" || source.carriedForward || carriesForwardMessage;
      if (nearlyEqual(source.value, sheetValue) && !needsStatusRepair) continue;

      const delta =
        source.previousValue !== null && source.previousValue !== undefined
          ? sheetValue - source.previousValue
          : null;

      await prisma.sourceValue.update({
        where: { id: source.id },
        data: {
          value: sheetValue,
          delta,
          carriedForward: false,
          status: "success",
          message:
            "Remediated from Data sheet historical baseline (Mar 3, 2026)",
          approvalStatus: "PENDING",
          approvedAt: null,
          approvedByUserId: null
        }
      });

      changes.push({
        month,
        sourceName: source.sourceName,
        oldValue: source.value,
        newValue: sheetValue,
        oldStatus: source.status,
        newStatus: "success"
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        targetMonths: [...TARGET_MONTHS],
        changedCount: changes.length,
        changes
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("Historical flat-data remediation failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
