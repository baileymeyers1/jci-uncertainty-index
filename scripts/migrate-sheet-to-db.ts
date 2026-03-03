import { PrismaClient } from "@prisma/client";
import { parse, isValid } from "date-fns";
import { surveyAdapters } from "../src/lib/ingest/adapters/sources";
import {
  getHeaderMap,
  getSheetValues,
  normalizeHeader
} from "../src/lib/sheets";

const prisma = new PrismaClient();

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseMonthLabel(label: string) {
  const parsedMonth = parse(label, "MMM yyyy", new Date());
  if (isValid(parsedMonth)) return parsedMonth;
  const fallback = new Date(label);
  return isValid(fallback) ? fallback : null;
}

function toMonthLabel(value: string | undefined) {
  if (!value) return null;
  const trimmed = value.toString().trim();
  if (!trimmed) return null;
  const parsed = parseMonthLabel(trimmed);
  if (!parsed) return null;
  return parsed.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function toNumber(value: string | undefined) {
  if (!value) return null;
  const trimmed = value.toString().trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function findMetaRow(
  rows: Array<{ survey: string; mean: number | null; stdev: number | null; direction: number | null; weight: number | null }>,
  sourceName: string
) {
  const key = normalize(sourceName);
  const direct = rows.find((row) => normalize(row.survey) === key);
  if (direct) return direct;

  return (
    rows.find(
      (row) =>
        normalize(row.survey).startsWith(key) || key.startsWith(normalize(row.survey))
    ) ?? null
  );
}

async function importMeta() {
  const values = await getSheetValues("Meta");
  const headerMap = getHeaderMap(values);
  const surveyIdx = headerMap.get("Survey") ?? 0;
  const meanIdx = headerMap.get("Mean");
  const stdevIdx = headerMap.get("Stdev");
  const directionIdx = headerMap.get("Direction");
  const weightIdx = headerMap.get("Weight");

  const rows = values
    .slice(1)
    .map((row) => ({
      survey: row[surveyIdx] ?? "",
      mean: meanIdx !== undefined ? toNumber(row[meanIdx]) : null,
      stdev: stdevIdx !== undefined ? toNumber(row[stdevIdx]) : null,
      direction: directionIdx !== undefined ? toNumber(row[directionIdx]) : null,
      weight: weightIdx !== undefined ? toNumber(row[weightIdx]) : null
    }))
    .filter((row) => row.survey.trim().length > 0);

  for (const adapter of surveyAdapters) {
    const meta = findMetaRow(rows, adapter.name);
    await prisma.surveyMeta.upsert({
      where: { sourceName: adapter.name },
      update: {
        mean: meta?.mean ?? null,
        stdev: meta?.stdev ?? null,
        direction: meta?.direction ?? 1,
        weight: meta?.weight ?? null
      },
      create: {
        sourceName: adapter.name,
        mean: meta?.mean ?? null,
        stdev: meta?.stdev ?? null,
        direction: meta?.direction ?? 1,
        weight: meta?.weight ?? null
      }
    });
  }

  return rows.length;
}

async function importHistoricalData() {
  const dataValues = await getSheetValues("Data");
  const zscoreValues = await getSheetValues("zscores");
  const headers = dataValues[0] ?? [];
  const dateIdx =
    headers.findIndex((header) => normalizeHeader(header) === "DATE") >= 0
      ? headers.findIndex((header) => normalizeHeader(header) === "DATE")
      : 0;

  const adapterColumnIndex = new Map<string, number>();
  surveyAdapters.forEach((adapter) => {
    const idx = headers.findIndex(
      (header) =>
        normalizeHeader(header || "") === normalizeHeader(adapter.sheetHeader) ||
        normalizeHeader(header || "") === normalizeHeader(adapter.name)
    );
    adapterColumnIndex.set(adapter.name, idx);
  });

  const rows = dataValues
    .slice(1)
    .map((row) => ({
      month: toMonthLabel(row[dateIdx]),
      row
    }))
    .filter((entry): entry is { month: string; row: string[] } => !!entry.month)
    .sort((a, b) => {
      const aDate = parseMonthLabel(a.month);
      const bDate = parseMonthLabel(b.month);
      if (aDate && bDate) return aDate.getTime() - bDate.getTime();
      return a.month.localeCompare(b.month);
    });

  const existingMonths = new Set(
    (await prisma.ingestRun.findMany({ select: { month: true } })).map((run) => run.month)
  );

  const previousBySource = new Map<string, number | null>();
  let importedRuns = 0;

  for (const entry of rows) {
    if (existingMonths.has(entry.month)) {
      for (const adapter of surveyAdapters) {
        const idx = adapterColumnIndex.get(adapter.name) ?? -1;
        if (idx < 0) continue;
        const parsed = toNumber(entry.row[idx]);
        if (parsed !== null) {
          previousBySource.set(adapter.name, parsed);
        }
      }
      continue;
    }

    const monthDate = parseMonthLabel(entry.month) ?? new Date();
    const startedAt = new Date(
      Date.UTC(monthDate.getFullYear(), monthDate.getMonth(), 1, 12, 0, 0, 0)
    );
    const finishedAt = new Date(startedAt.getTime() + 60_000);

    const ingestRun = await prisma.ingestRun.create({
      data: {
        month: entry.month,
        status: "SUCCESS",
        startedAt,
        finishedAt,
        message: "Imported from Google Sheets historical baseline"
      }
    });

    for (const adapter of surveyAdapters) {
      const idx = adapterColumnIndex.get(adapter.name) ?? -1;
      const value = idx >= 0 ? toNumber(entry.row[idx]) : null;
      const previousValue = previousBySource.get(adapter.name) ?? null;
      const delta =
        value !== null &&
        previousValue !== null &&
        previousValue !== undefined
          ? value - previousValue
          : null;

      await prisma.sourceValue.create({
        data: {
          ingestId: ingestRun.id,
          sourceName: adapter.name,
          sourceUrl: adapter.sourceUrl,
          value,
          previousValue,
          delta,
          carriedForward: false,
          valueDate: startedAt,
          status: value === null ? "missing" : "success",
          message: "Imported from Google Sheets historical baseline",
          approvalStatus: "APPROVED",
          approvalNote: "Auto-approved during sheet migration",
          approvedAt: new Date()
        }
      });

      if (value !== null) {
        previousBySource.set(adapter.name, value);
      }
    }

    existingMonths.add(entry.month);
    importedRuns += 1;
  }

  return { importedRuns, dataRows: rows.length, zscoreRows: zscoreValues.length - 1 };
}

async function main() {
  const importedMetaRows = await importMeta();
  const historical = await importHistoricalData();

  console.log("Sheet-to-DB migration complete.");
  console.log(`Meta rows scanned: ${importedMetaRows}`);
  console.log(`Historical data rows scanned: ${historical.dataRows}`);
  console.log(`Historical zscore rows scanned: ${historical.zscoreRows}`);
  console.log(`New ingest runs imported: ${historical.importedRuns}`);
}

main()
  .catch((error) => {
    console.error("Sheet-to-DB migration failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
