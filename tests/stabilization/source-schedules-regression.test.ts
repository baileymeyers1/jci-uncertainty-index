import assert from "node:assert/strict";
import type { SourceReleaseSchedule } from "@prisma/client";
import { buildSourceScheduleResponseItem } from "../../src/lib/source-schedules";
import type { SurveyAdapter } from "../../src/lib/ingest/adapters/types";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const adapter: SurveyAdapter = {
  name: "Conference Board Consumer Confidence",
  sheetHeader: "Conference Board Consumer Confidence",
  frequency: "monthly",
  sourceUrl: "https://www.conference-board.org/topics/consumer-confidence/",
  releaseCadence: "Monthly",
  fetchValue: async () => ({ value: null, status: "missing" })
};

test("Source schedule response leaves date unknown when no researched schedule exists", () => {
  const response = buildSourceScheduleResponseItem(adapter);
  assert.equal(response.nextExpectedReleaseDate, null);
  assert.equal(response.confidence, null);
  assert.equal(response.isResearched, false);
});

test("Source schedule response keeps researched fields when schedule exists", () => {
  const schedule: SourceReleaseSchedule = {
    id: "sch_1",
    sourceName: adapter.name,
    advanceMonths: 1,
    nextExpectedReleaseDate: new Date("2026-03-31T12:00:00.000Z"),
    confidence: "OFFICIAL",
    evidenceUrl: "https://example.com/release",
    evidenceNote: "Official calendar",
    lastResearchedAt: new Date("2026-02-26T00:00:00.000Z"),
    createdAt: new Date("2026-02-26T00:00:00.000Z"),
    updatedAt: new Date("2026-02-26T00:00:00.000Z")
  };
  const response = buildSourceScheduleResponseItem(adapter, schedule);
  assert.equal(response.nextExpectedReleaseDate, "2026-03-31T12:00:00.000Z");
  assert.equal(response.confidence, "OFFICIAL");
  assert.equal(response.isResearched, true);
});
