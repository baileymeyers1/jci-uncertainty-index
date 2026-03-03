import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { surveyAdapters } from "@/lib/ingest/adapters/sources";
import { requireSession, unauthorized } from "@/lib/auth-guard";
import { buildSourceScheduleResponseItem } from "@/lib/source-schedules";

function isValidConfidence(value: string) {
  return value === "OFFICIAL" || value === "ESTIMATED";
}

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();

  const schedules = await prisma.sourceReleaseSchedule.findMany();
  const scheduleMap = new Map(schedules.map((schedule) => [schedule.sourceName, schedule]));

  const items = surveyAdapters.map((adapter) =>
    buildSourceScheduleResponseItem(adapter, scheduleMap.get(adapter.name))
  );

  return NextResponse.json({ schedules: items });
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const sourceName = String(body?.sourceName ?? "").trim();
  const advanceMonths = Number(body?.advanceMonths);
  const nextExpectedReleaseDate = body?.nextExpectedReleaseDate ? new Date(body.nextExpectedReleaseDate) : null;
  const confidenceRaw = String(body?.confidence ?? "OFFICIAL").trim().toUpperCase();
  const evidenceUrl = body?.evidenceUrl ? String(body.evidenceUrl).trim() : null;
  const evidenceNote = body?.evidenceNote ? String(body.evidenceNote).trim() : null;

  if (!sourceName || !Number.isFinite(advanceMonths) || advanceMonths < 1 || !nextExpectedReleaseDate) {
    return NextResponse.json(
      { error: "sourceName, advanceMonths, and nextExpectedReleaseDate are required" },
      { status: 400 }
    );
  }

  if (Number.isNaN(nextExpectedReleaseDate.getTime())) {
    return NextResponse.json({ error: "Invalid nextExpectedReleaseDate" }, { status: 400 });
  }

  if (!isValidConfidence(confidenceRaw)) {
    return NextResponse.json({ error: "confidence must be OFFICIAL or ESTIMATED" }, { status: 400 });
  }
  const confidence = confidenceRaw as "OFFICIAL" | "ESTIMATED";

  if (confidence === "ESTIMATED" && !evidenceUrl) {
    return NextResponse.json({ error: "evidenceUrl is required for estimated schedules" }, { status: 400 });
  }

  if (evidenceUrl) {
    try {
      new URL(evidenceUrl);
    } catch {
      return NextResponse.json({ error: "Invalid evidenceUrl" }, { status: 400 });
    }
  }

  const knownSource = surveyAdapters.some((adapter) => adapter.name === sourceName);
  if (!knownSource) {
    return NextResponse.json({ error: "Unknown sourceName" }, { status: 404 });
  }

  const schedule = await prisma.sourceReleaseSchedule.upsert({
    where: { sourceName },
    update: {
      advanceMonths,
      nextExpectedReleaseDate,
      confidence,
      evidenceUrl,
      evidenceNote,
      lastResearchedAt: new Date()
    },
    create: {
      sourceName,
      advanceMonths,
      nextExpectedReleaseDate,
      confidence,
      evidenceUrl,
      evidenceNote,
      lastResearchedAt: new Date()
    }
  });

  return NextResponse.json({ schedule });
}
