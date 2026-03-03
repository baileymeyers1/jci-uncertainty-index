import { PrismaClient } from "@prisma/client";
import { isValid, parse } from "date-fns";
import { getHeaderMap, getSheetValues, normalizeHeader } from "../src/lib/sheets";

const prisma = new PrismaClient();

const INDEX_SCORE_TOLERANCE = 0.5;
const INDEX_Z_TOLERANCE = 0.08;
const PERCENTILE_TOLERANCE = 0.02;

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseMonthLabel(label: string | undefined | null) {
  if (!label) return null;
  const trimmed = label.toString().trim();
  if (!trimmed) return null;
  const parsedMonth = parse(trimmed, "MMM yyyy", new Date());
  if (isValid(parsedMonth)) return parsedMonth;
  const fallback = new Date(trimmed);
  return isValid(fallback) ? fallback : null;
}

function toMonthKey(value: string | undefined | null) {
  const parsed = parseMonthLabel(value);
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function standardNormalCdf(value: number) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const erf =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

async function loadSheetMetrics() {
  const [dataValues, zValues] = await Promise.all([
    getSheetValues("Data"),
    getSheetValues("zscores")
  ]);

  const dataHeaderMap = getHeaderMap(dataValues);
  const zHeaderMap = getHeaderMap(zValues);
  const dataDateIdx = dataHeaderMap.get("DATE") ?? 0;
  const indexScoreIdx = dataHeaderMap.get("UNCERTAINTY INDEX");
  const percentileIdx = dataHeaderMap.get("INDEX PERCENTILE");
  const zDateIdx = zHeaderMap.get("DATE") ?? 0;
  const indexZIdx =
    zHeaderMap.get("INDEX (z score)") ??
    (() => {
      for (const [header, idx] of zHeaderMap.entries()) {
        const normalized = normalize(header);
        if (normalized.includes("index") && normalized.includes("z")) return idx;
      }
      return undefined;
    })();

  const sheetByMonth = new Map<
    string,
    { indexScore: number | null; indexZ: number | null; percentile: number | null }
  >();

  dataValues.slice(1).forEach((row) => {
    const month = toMonthKey(row[dataDateIdx]);
    if (!month) return;
    sheetByMonth.set(month, {
      indexScore: indexScoreIdx !== undefined ? toNumber(row[indexScoreIdx]) : null,
      indexZ: null,
      percentile: percentileIdx !== undefined ? toNumber(row[percentileIdx]) : null
    });
  });

  zValues.slice(1).forEach((row) => {
    const month = toMonthKey(row[zDateIdx]);
    if (!month || indexZIdx === undefined) return;
    const current = sheetByMonth.get(month) ?? {
      indexScore: null,
      indexZ: null,
      percentile: null
    };
    current.indexZ = toNumber(row[indexZIdx]);
    sheetByMonth.set(month, current);
  });

  return sheetByMonth;
}

async function loadDbMetrics() {
  const [metaRows, runs] = await Promise.all([
    prisma.surveyMeta.findMany(),
    prisma.ingestRun.findMany({
      where: { status: "SUCCESS" },
      include: { sources: true },
      orderBy: { startedAt: "desc" }
    })
  ]);

  const metaMap = new Map(
    metaRows.map((row) => [normalize(row.sourceName), row])
  );
  const latestByMonth = new Map<string, (typeof runs)[number]>();
  runs.forEach((run) => {
    if (!latestByMonth.has(run.month)) latestByMonth.set(run.month, run);
  });

  const dbByMonth = new Map<
    string,
    { indexScore: number | null; indexZ: number | null; percentile: number | null }
  >();

  latestByMonth.forEach((run, month) => {
    let weightedSum = 0;
    let weightTotal = 0;

    run.sources.forEach((source) => {
      if (source.value === null || source.value === undefined) return;
      const meta = metaMap.get(normalize(source.sourceName));
      if (
        !meta ||
        meta.mean === null ||
        meta.stdev === null ||
        meta.stdev === 0 ||
        meta.weight === null
      ) {
        return;
      }
      const direction = meta.direction ?? 1;
      const z = ((source.value - meta.mean) / meta.stdev) * direction;
      weightedSum += z * meta.weight;
      weightTotal += meta.weight;
    });

    const indexZ = weightTotal > 0 ? weightedSum / weightTotal : null;
    const indexScore = indexZ === null ? null : clamp(50 + 10 * indexZ, 0, 100);
    const percentile = indexZ === null ? null : standardNormalCdf(indexZ);
    dbByMonth.set(month, { indexScore, indexZ, percentile });
  });

  return dbByMonth;
}

async function main() {
  const [sheetByMonth, dbByMonth] = await Promise.all([
    loadSheetMetrics(),
    loadDbMetrics()
  ]);

  const months = Array.from(sheetByMonth.keys()).filter((month) => dbByMonth.has(month));
  const mismatches: string[] = [];

  for (const month of months) {
    const sheet = sheetByMonth.get(month);
    const db = dbByMonth.get(month);
    if (!sheet || !db) continue;

    if (
      sheet.indexScore !== null &&
      db.indexScore !== null &&
      Math.abs(sheet.indexScore - db.indexScore) > INDEX_SCORE_TOLERANCE
    ) {
      mismatches.push(
        `${month}: indexScore sheet=${sheet.indexScore} db=${db.indexScore}`
      );
    }

    if (
      sheet.indexZ !== null &&
      db.indexZ !== null &&
      Math.abs(sheet.indexZ - db.indexZ) > INDEX_Z_TOLERANCE
    ) {
      mismatches.push(`${month}: indexZ sheet=${sheet.indexZ} db=${db.indexZ}`);
    }

    if (
      sheet.percentile !== null &&
      db.percentile !== null &&
      Math.abs(sheet.percentile - db.percentile) > PERCENTILE_TOLERANCE
    ) {
      mismatches.push(
        `${month}: percentile sheet=${sheet.percentile} db=${db.percentile}`
      );
    }
  }

  console.log(`Compared ${months.length} month(s) between sheet and DB.`);
  if (mismatches.length) {
    console.error(`Found ${mismatches.length} parity mismatch(es):`);
    mismatches.slice(0, 25).forEach((entry) => console.error(`- ${entry}`));
    process.exit(1);
  }

  console.log("Sheet parity check passed within configured tolerances.");
}

main()
  .catch((error) => {
    console.error("Sheet parity verification failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
