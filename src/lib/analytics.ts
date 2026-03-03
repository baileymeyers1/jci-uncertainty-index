import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { compareMonthLabels, parseMonthLabel, toMonthKey } from "@/lib/month";
import { surveyAdapters } from "@/lib/ingest/adapters/sources";
import {
  applyMetaFallbacks,
  computeMetricsForSources,
  type MetaRow,
  type MetricComputation
} from "@/lib/analytics-core";

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

function normalizeSourceName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
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

async function getEffectiveMetaBySourceMap(runs: RunWithSources[]) {
  const storedMetaBySource = await getMetaBySourceMap();
  return applyMetaFallbacks(storedMetaBySource, runs);
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

export { applyMetaFallbacks, computeMetricsForSources };
export type { MetricComputation, MetaRow };

export async function getOverviewData(): Promise<OverviewData> {
  const runs = await getLatestSuccessfulRunsByMonth();
  const metaBySource = await getEffectiveMetaBySourceMap(runs);

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
  const runs = await getLatestSuccessfulRunsByMonth();
  const metaBySource = await getEffectiveMetaBySourceMap(runs);
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
  const runs = await getLatestSuccessfulRunsByMonth();
  const metaBySource = await getEffectiveMetaBySourceMap(runs);
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
