import { PrismaClient } from "@prisma/client";
import { fetchConferenceBoardConfidence } from "../src/lib/ingest/adapters/conferenceBoard";
import { getPolicyUncertaintyMonthlyValue } from "../src/lib/ingest/adapters/policyUncertainty";
import {
  RELEASE_SCHEDULE_RESEARCHED_AT,
  RELEASE_SCHEDULE_SEED_ROWS
} from "./release-schedule-seed-data";

const prisma = new PrismaClient();

const TARGET_RUN_MONTH = "Mar 2026";
const REFERENCE_DATE = new Date("2026-03-03T12:00:00.000Z");
const TARGET_SOURCES = {
  conferenceBoard: "Conference Board Consumer Confidence",
  epu: "Economic Policy Uncertainty Index (month average)"
} as const;

function calculateDelta(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null;
  return current - previous;
}

function isSameValue(a: number | null, b: number | null) {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) < 1e-9;
}

async function upsertResearchedSchedules() {
  const researchedAt = new Date(RELEASE_SCHEDULE_RESEARCHED_AT);
  for (const row of RELEASE_SCHEDULE_SEED_ROWS) {
    await prisma.sourceReleaseSchedule.upsert({
      where: { sourceName: row.sourceName },
      update: {
        advanceMonths: row.advanceMonths,
        nextExpectedReleaseDate: new Date(row.nextExpectedReleaseDate),
        confidence: row.confidence,
        evidenceUrl: row.evidenceUrl,
        evidenceNote: row.evidenceNote ?? null,
        lastResearchedAt: researchedAt
      },
      create: {
        sourceName: row.sourceName,
        advanceMonths: row.advanceMonths,
        nextExpectedReleaseDate: new Date(row.nextExpectedReleaseDate),
        confidence: row.confidence,
        evidenceUrl: row.evidenceUrl,
        evidenceNote: row.evidenceNote ?? null,
        lastResearchedAt: researchedAt
      }
    });
  }
}

async function main() {
  const run = await prisma.ingestRun.findFirst({
    where: { month: TARGET_RUN_MONTH },
    orderBy: { startedAt: "desc" },
    include: { sources: true }
  });

  if (!run) {
    throw new Error(`No ingest run found for ${TARGET_RUN_MONTH}`);
  }

  const conferenceBoard = await fetchConferenceBoardConfidence(REFERENCE_DATE);
  if (conferenceBoard.value === null) {
    throw new Error(conferenceBoard.message ?? "Conference Board remediation value missing");
  }

  const epu = await getPolicyUncertaintyMonthlyValue(REFERENCE_DATE);
  if (!epu) {
    throw new Error("Policy uncertainty remediation value missing");
  }

  const sourceRows = new Map(run.sources.map((source) => [source.sourceName, source]));

  const remediationTargets = [
    {
      sourceName: TARGET_SOURCES.conferenceBoard,
      nextValue: conferenceBoard.value,
      valueDate: conferenceBoard.valueDate ?? REFERENCE_DATE,
      sourceNote: conferenceBoard.message ?? "Conference Board remediation fetch"
    },
    {
      sourceName: TARGET_SOURCES.epu,
      nextValue: epu.value,
      valueDate: epu.date,
      sourceNote: `Policy uncertainty XLSX monthly value ${epu.year}-${String(epu.month).padStart(2, "0")}`
    }
  ];

  const nowIso = new Date().toISOString();
  const report: Array<{
    sourceName: string;
    sourceValueId: string;
    oldValue: number | null;
    newValue: number | null;
    changed: boolean;
    sourceNote: string;
  }> = [];

  for (const target of remediationTargets) {
    const row = sourceRows.get(target.sourceName);
    if (!row) {
      throw new Error(`Source row not found in ${TARGET_RUN_MONTH}: ${target.sourceName}`);
    }

    const changed = !isSameValue(row.value, target.nextValue);
    const delta = calculateDelta(target.nextValue, row.previousValue);

    await prisma.sourceValue.update({
      where: { id: row.id },
      data: {
        value: target.nextValue,
        delta,
        carriedForward: false,
        valueDate: target.valueDate,
        status: "success",
        message: `Remediated ${nowIso}: ${target.sourceNote}`,
        approvalStatus: "PENDING",
        approvalNote: "Reset after March 2026 stabilization remediation",
        approvedAt: null,
        approvedByUserId: null
      }
    });

    report.push({
      sourceName: target.sourceName,
      sourceValueId: row.id,
      oldValue: row.value,
      newValue: target.nextValue,
      changed,
      sourceNote: target.sourceNote
    });
  }

  await upsertResearchedSchedules();

  await prisma.ingestRun.update({
    where: { id: run.id },
    data: {
      message: `Stabilization remediation run ${nowIso}: corrected Conference Board + EPU values and reset approvals`
    }
  });

  const changedCount = report.filter((entry) => entry.changed).length;
  console.log(
    JSON.stringify(
      {
        runId: run.id,
        month: run.month,
        changedCount,
        correctedSources: report,
        schedulesUpserted: RELEASE_SCHEDULE_SEED_ROWS.length
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("March 2026 remediation failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
