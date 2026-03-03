import assert from "node:assert/strict";
import {
  applyMetaFallbacks,
  computeMetricsForSources
} from "../../src/lib/analytics-core";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

const sourceA = "Conference Board Consumer Confidence";
const sourceB = "Economic Policy Uncertainty Index (month average)";

const historicalRuns = [
  {
    sources: [
      { sourceName: sourceA, value: 87 },
      { sourceName: sourceB, value: 350 }
    ]
  },
  {
    sources: [
      { sourceName: sourceA, value: 89 },
      { sourceName: sourceB, value: 360 }
    ]
  },
  {
    sources: [
      { sourceName: sourceA, value: 91.2 },
      { sourceName: sourceB, value: 386 }
    ]
  }
];

test("Analytics applies historical fallback when survey meta table is empty", () => {
  const effectiveMeta = applyMetaFallbacks(new Map(), historicalRuns);

  const conferenceMeta = effectiveMeta.get(normalize(sourceA));
  const epuMeta = effectiveMeta.get(normalize(sourceB));
  assert.ok(conferenceMeta);
  assert.ok(epuMeta);
  assert.equal(conferenceMeta?.weight, 1);
  assert.equal(epuMeta?.weight, 1);

  const latestSources = historicalRuns[historicalRuns.length - 1].sources;
  const metrics = computeMetricsForSources(latestSources, effectiveMeta);

  assert.notEqual(metrics.sourceZScores[sourceA], null);
  assert.notEqual(metrics.sourceZScores[sourceB], null);
  assert.notEqual(metrics.indexZ, null);
  assert.notEqual(metrics.indexScore, null);
  assert.notEqual(metrics.percentile, null);
});

test("Analytics defaults missing weight to 1 so index remains computable", () => {
  const meta = new Map([
    [
      normalize(sourceA),
      {
        sourceName: sourceA,
        mean: 90,
        stdev: 2,
        direction: 1,
        weight: null
      }
    ],
    [
      normalize(sourceB),
      {
        sourceName: sourceB,
        mean: 370,
        stdev: 10,
        direction: 1,
        weight: null
      }
    ]
  ]);

  const metrics = computeMetricsForSources(
    [
      { sourceName: sourceA, value: 91.2 },
      { sourceName: sourceB, value: 386 }
    ],
    meta
  );

  assert.notEqual(metrics.indexZ, null);
  assert.notEqual(metrics.indexScore, null);
  assert.notEqual(metrics.percentile, null);
});
