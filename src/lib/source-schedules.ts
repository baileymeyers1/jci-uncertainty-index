import type { SourceReleaseSchedule } from "@prisma/client";
import type { SurveyAdapter } from "./ingest/adapters/types";

export interface SourceScheduleResponse {
  sourceName: string;
  sourceUrl: string;
  frequency: string;
  releaseCadence: string;
  advanceMonths: number;
  nextExpectedReleaseDate: string | null;
  confidence: "OFFICIAL" | "ESTIMATED" | null;
  evidenceUrl: string | null;
  evidenceNote: string | null;
  lastResearchedAt: string | null;
  isResearched: boolean;
}

function defaultAdvanceMonths(frequency: string) {
  return frequency === "quarterly" ? 3 : 1;
}

export function buildSourceScheduleResponseItem(
  adapter: SurveyAdapter,
  schedule?: SourceReleaseSchedule
): SourceScheduleResponse {
  const advanceMonths = schedule?.advanceMonths ?? defaultAdvanceMonths(adapter.frequency);

  if (!schedule) {
    return {
      sourceName: adapter.name,
      sourceUrl: adapter.sourceUrl,
      frequency: adapter.frequency,
      releaseCadence: adapter.releaseCadence,
      advanceMonths,
      nextExpectedReleaseDate: null,
      confidence: null,
      evidenceUrl: null,
      evidenceNote: null,
      lastResearchedAt: null,
      isResearched: false
    };
  }

  return {
    sourceName: adapter.name,
    sourceUrl: adapter.sourceUrl,
    frequency: adapter.frequency,
    releaseCadence: adapter.releaseCadence,
    advanceMonths,
    nextExpectedReleaseDate: schedule.nextExpectedReleaseDate.toISOString(),
    confidence: schedule.confidence,
    evidenceUrl: schedule.evidenceUrl ?? null,
    evidenceNote: schedule.evidenceNote ?? null,
    lastResearchedAt: schedule.lastResearchedAt?.toISOString() ?? null,
    isResearched: true
  };
}
