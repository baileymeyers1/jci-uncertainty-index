export interface MetaRow {
  sourceName: string;
  mean: number | null;
  stdev: number | null;
  direction: number | null;
  weight: number | null;
}

export interface MetricComputation {
  sourceZScores: Record<string, number | null>;
  indexZ: number | null;
  indexScore: number | null;
  percentile: number | null;
}

interface HistoricalRun {
  sources: Array<{ sourceName: string; value: number | null }>;
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

function sampleStandardDeviation(values: number[]) {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);
  if (!Number.isFinite(variance) || variance <= 0) return null;
  const stdev = Math.sqrt(variance);
  return Number.isFinite(stdev) && stdev > 0 ? stdev : null;
}

function deriveHistoricalStats(
  historicalRuns: HistoricalRun[]
): Map<string, { mean: number | null; stdev: number | null }> {
  const valuesBySource = new Map<string, number[]>();

  historicalRuns.forEach((run) => {
    run.sources.forEach((source) => {
      if (source.value === null || source.value === undefined) return;
      if (!Number.isFinite(source.value)) return;
      const key = normalizeSourceName(source.sourceName);
      const values = valuesBySource.get(key) ?? [];
      values.push(source.value);
      valuesBySource.set(key, values);
    });
  });

  const stats = new Map<string, { mean: number | null; stdev: number | null }>();
  valuesBySource.forEach((values, key) => {
    const mean =
      values.length > 0
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null;
    const stdev = sampleStandardDeviation(values);
    stats.set(key, { mean, stdev });
  });
  return stats;
}

export function applyMetaFallbacks(
  metaBySource: Map<string, MetaRow>,
  historicalRuns: HistoricalRun[]
) {
  const historicalStats = deriveHistoricalStats(historicalRuns);
  const sourceNameByKey = new Map<string, string>();

  metaBySource.forEach((meta, key) => {
    sourceNameByKey.set(key, meta.sourceName);
  });

  historicalRuns.forEach((run) => {
    run.sources.forEach((source) => {
      const key = normalizeSourceName(source.sourceName);
      if (!sourceNameByKey.has(key)) {
        sourceNameByKey.set(key, source.sourceName);
      }
    });
  });

  const result = new Map<string, MetaRow>();
  sourceNameByKey.forEach((sourceName, key) => {
    const storedMeta = metaBySource.get(key);
    const stats = historicalStats.get(key);
    result.set(key, {
      sourceName,
      mean: storedMeta?.mean ?? stats?.mean ?? null,
      stdev: storedMeta?.stdev ?? stats?.stdev ?? null,
      direction: storedMeta?.direction ?? 1,
      weight: storedMeta?.weight ?? 1
    });
  });

  return result;
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

    const weight =
      meta.weight !== null && meta.weight !== undefined && Number.isFinite(meta.weight)
        ? meta.weight
        : 1;
    if (weight !== 0) {
      weightedSum += z * weight;
      weightTotal += weight;
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
