import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { compareMonthLabels, parseMonthLabel, toMonthKey } from "@/lib/month";
import { surveyAdapters } from "@/lib/ingest/adapters/sources";

type RunWithSources = Prisma.IngestRunGetPayload<{
  include: { sources: true };
}>;

export interface IndexPoint {
  date: string;
  indexScore: number | null;
  indexZ: number | null;
  percentile: number | null;
}

export interface SeriesPoint {
  date: string;
  value: number | null;
}

export interface NamedSeries {
  name: string;
  points: SeriesPoint[];
}

export interface OverviewData {
  indexSeries: IndexPoint[];
  zScoreSeries: NamedSeries[];
  rawScoreSeries: NamedSeries[];
  latest: {
    indexScore: number | null;
    indexZ: number | null;
    percentile: number | null;
    date: string | null;
  };
}

export interface MetricComputation {
  sourceZScores: Record<string, number | null>;
  indexZ: number | null;
  indexScore: number | null;
  percentile: number | null;
}

interface MetaRow {
  sourceName: string;
  mean: number | null;
  stdev: number | null;
  direction: number | null;
  weight: number | null;
}

function normalizeSourceName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function standardNormalCdf(value: number) {
  // Abramowitz-Stegun erf approximation.
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

function assertIndexSeriesConsistency(indexSeries: IndexPoint[]) {
  indexSeries.forEach((point) => {
    const hasScore = point.indexScore !== null && point.indexScore !== undefined;
    const hasZ = point.indexZ !== null && point.indexZ !== undefined;
    const hasPercentile = point.percentile !== null && point.percentile !== undefined;
    if (hasScore && (!hasZ || !hasPercentile)) {
      throw new Error(
        `Inconsistent index metrics for ${point.date}: score=${point.indexScore}, z=${point.indexZ}, percentile=${point.percentile}`
      );
    }
  });
}

async function getMetaRows() {
  return prisma.surveyMeta.findMany();
}

export async function getMetaStatsMap() {
  const rows = await getMetaRows();
  const map = new Map<string, { mean: number | null; stdev: number | null }>();
  rows.forEach((row) => {
    map.set(normalizeSourceName(row.sourceName), {
      mean: row.mean,
      stdev: row.stdev
    });
  });
  return map;
}

export async function getMetaBySourceMap() {
  const rows = await getMetaRows();
  const map = new Map<string, MetaRow>();
  rows.forEach((row) => {
    map.set(normalizeSourceName(row.sourceName), row);
  });
  return map;
}

export async function getLatestSuccessfulRunsByMonth() {
  const runs = await prisma.ingestRun.findMany({
    where: { status: "SUCCESS" },
    include: { sources: true },
    orderBy: { startedAt: "desc" }
  });

  const latestByMonth = new Map<string, RunWithSources>();
  for (const run of runs) {
    if (!latestByMonth.has(run.month)) {
      latestByMonth.set(run.month, run);
    }
  }

  return Array.from(latestByMonth.values()).sort((a, b) =>
    compareMonthLabels(a.month, b.month)
  );
}

export function computeMetricsForSources(
  sources: Array<{ sourceName: string; value: number | null }>,
  metaBySource: Map<string, MetaRow>
): MetricComputation {
  const sourceZScores: Record<string, number | null> = {};
  let weightedSum = 0;
  let weightTotal = 0;

  for (const source of sources) {
    const key = normalizeSourceName(source.sourceName);
    const meta = metaBySource.get(key);

    if (
      source.value === null ||
      source.value === undefined ||
      !meta ||
      meta.mean === null ||
      meta.mean === undefined ||
      meta.stdev === null ||
      meta.stdev === undefined ||
      meta.stdev === 0
    ) {
      sourceZScores[source.sourceName] = null;
      continue;
    }

    const direction = meta.direction ?? 1;
    const z = ((source.value - meta.mean) / meta.stdev) * direction;
    sourceZScores[source.sourceName] = z;

    if (meta.weight !== null && meta.weight !== undefined && Number.isFinite(meta.weight)) {
      weightedSum += z * meta.weight;
      weightTotal += meta.weight;
    }
  }

  const indexZ = weightTotal > 0 ? weightedSum / weightTotal : null;
  const indexScore = indexZ === null ? null : clamp(50 + 10 * indexZ, 0, 100);
  const percentile = indexZ === null ? null : standardNormalCdf(indexZ);

  return {
    sourceZScores,
    indexZ,
    indexScore,
    percentile
  };
}

export async function getOverviewData(): Promise<OverviewData> {
  const [runs, metaBySource] = await Promise.all([
    getLatestSuccessfulRunsByMonth(),
    getMetaBySourceMap()
  ]);

  const adapterOrder = surveyAdapters.map((adapter) => adapter.name);
  const rawBySource = new Map<string, SeriesPoint[]>();
  const zBySource = new Map<string, SeriesPoint[]>();
  adapterOrder.forEach((name) => {
    rawBySource.set(name, []);
    zBySource.set(name, []);
  });

  const indexSeries: IndexPoint[] = runs.map((run) => {
    const metrics = computeMetricsForSources(run.sources, metaBySource);
    const sourceMap = new Map(run.sources.map((source) => [source.sourceName, source]));

    adapterOrder.forEach((sourceName) => {
      const source = sourceMap.get(sourceName);
      rawBySource.get(sourceName)?.push({
        date: run.month,
        value: source?.value ?? null
      });
      zBySource.get(sourceName)?.push({
        date: run.month,
        value: metrics.sourceZScores[sourceName] ?? null
      });
    });

    return {
      date: run.month,
      indexScore: metrics.indexScore,
      indexZ: metrics.indexZ,
      percentile: metrics.percentile
    };
  });

  const sortedIndexSeries = [...indexSeries].sort((a, b) =>
    compareMonthLabels(a.date, b.date)
  );
  assertIndexSeriesConsistency(sortedIndexSeries);

  const rawScoreSeries: NamedSeries[] = adapterOrder.map((name) => ({
    name,
    points: [...(rawBySource.get(name) ?? [])].sort((a, b) =>
      compareMonthLabels(a.date, b.date)
    )
  }));

  const zScoreSeries: NamedSeries[] = adapterOrder.map((name) => ({
    name,
    points: [...(zBySource.get(name) ?? [])].sort((a, b) =>
      compareMonthLabels(a.date, b.date)
    )
  }));

  const latest = sortedIndexSeries.length
    ? sortedIndexSeries[sortedIndexSeries.length - 1]
    : null;

  if (latest?.indexScore !== null && (latest?.indexZ === null || latest?.percentile === null)) {
    throw new Error(
      `Latest index metrics are inconsistent for ${latest.date}: score=${latest.indexScore}, z=${latest.indexZ}, percentile=${latest.percentile}`
    );
  }

  return {
    indexSeries: sortedIndexSeries,
    zScoreSeries,
    rawScoreSeries,
    latest: {
      indexScore: latest?.indexScore ?? null,
      indexZ: latest?.indexZ ?? null,
      percentile: latest?.percentile ?? null,
      date: latest?.date ?? null
    }
  };
}

export async function getLatestRunValuesAndZScores() {
  const [runs, metaBySource] = await Promise.all([
    getLatestSuccessfulRunsByMonth(),
    getMetaBySourceMap()
  ]);
  const latestRun = runs.length ? runs[runs.length - 1] : null;
  const valueMap: Record<string, number | null> = {};
  const zMap: Record<string, number | null> = {};

  if (!latestRun) {
    return { valueMap, zMap };
  }

  const metrics = computeMetricsForSources(latestRun.sources, metaBySource);
  latestRun.sources.forEach((source) => {
    valueMap[source.sourceName] = source.value;
    zMap[source.sourceName] = metrics.sourceZScores[source.sourceName] ?? null;
  });

  return { valueMap, zMap };
}

export async function getZScoresForMonths(monthLabels: string[]) {
  const targetKeys = new Set(monthLabels.map((label) => toMonthKey(label)));
  const [runs, metaBySource] = await Promise.all([
    getLatestSuccessfulRunsByMonth(),
    getMetaBySourceMap()
  ]);
  const map = new Map<string, Record<string, number | null>>();

  runs.forEach((run) => {
    const key = toMonthKey(run.month);
    if (!targetKeys.has(key)) return;
    const metrics = computeMetricsForSources(run.sources, metaBySource);
    map.set(key, metrics.sourceZScores);
  });

  return map;
}

export function monthLabelForDate(date: Date) {
  const parsed = parseMonthLabel(date.toISOString());
  return parsed ? toMonthKey(parsed.toISOString()) : toMonthKey(date.toISOString());
}
