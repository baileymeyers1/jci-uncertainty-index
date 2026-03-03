import assert from "node:assert/strict";
import {
  isHistoricalIngestTarget,
  shouldUseHistoricalFallback
} from "../../src/lib/ingest/backfill-policy";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test("Current month is not treated as historical ingest target", () => {
  const reference = new Date("2026-03-03T12:00:00.000Z");
  const target = new Date("2026-03-01T12:00:00.000Z");
  assert.equal(isHistoricalIngestTarget(target, reference), false);
});

test("Prior month is treated as historical ingest target", () => {
  const reference = new Date("2026-03-03T12:00:00.000Z");
  const target = new Date("2026-02-01T12:00:00.000Z");
  assert.equal(isHistoricalIngestTarget(target, reference), true);
});

test("Historical unsupported adapters are forced into fallback", () => {
  const reference = new Date("2026-03-03T12:00:00.000Z");
  const target = new Date("2026-01-15T00:00:00.000Z");
  assert.equal(
    shouldUseHistoricalFallback({ supportsHistorical: false }, target, reference),
    true
  );
});

test("Historical supported adapters still fetch source value", () => {
  const reference = new Date("2026-03-03T12:00:00.000Z");
  const target = new Date("2026-01-15T00:00:00.000Z");
  assert.equal(
    shouldUseHistoricalFallback({ supportsHistorical: true }, target, reference),
    false
  );
});
