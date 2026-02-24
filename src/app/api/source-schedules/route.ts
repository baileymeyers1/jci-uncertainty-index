import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { surveyAdapters } from "@/lib/ingest/adapters/sources";
import { requireSession, unauthorized } from "@/lib/auth-guard";

function defaultAdvanceMonths(frequency: string) {
  return frequency === "quarterly" ? 3 : 1;
}

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();

  const schedules = await prisma.sourceReleaseSchedule.findMany();
  const scheduleMap = new Map(schedules.map((schedule) => [schedule.sourceName, schedule]));

  const items = surveyAdapters.map((adapter) => {
    const schedule = scheduleMap.get(adapter.name);
    const advanceMonths = schedule?.advanceMonths ?? defaultAdvanceMonths(adapter.frequency);
    const fallbackDate = new Date();
    fallbackDate.setMonth(fallbackDate.getMonth() + advanceMonths);
    return {
      sourceName: adapter.name,
      sourceUrl: adapter.sourceUrl,
      frequency: adapter.frequency,
      releaseCadence: adapter.releaseCadence,
      advanceMonths,
      nextExpectedReleaseDate: (schedule?.nextExpectedReleaseDate ?? fallbackDate).toISOString()
    };
  });

  return NextResponse.json({ schedules: items });
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const sourceName = String(body?.sourceName ?? "").trim();
  const advanceMonths = Number(body?.advanceMonths);
  const nextExpectedReleaseDate = body?.nextExpectedReleaseDate ? new Date(body.nextExpectedReleaseDate) : null;

  if (!sourceName || !Number.isFinite(advanceMonths) || advanceMonths < 1 || !nextExpectedReleaseDate) {
    return NextResponse.json(
      { error: "sourceName, advanceMonths, and nextExpectedReleaseDate are required" },
      { status: 400 }
    );
  }

  if (Number.isNaN(nextExpectedReleaseDate.getTime())) {
    return NextResponse.json({ error: "Invalid nextExpectedReleaseDate" }, { status: 400 });
  }

  const knownSource = surveyAdapters.some((adapter) => adapter.name === sourceName);
  if (!knownSource) {
    return NextResponse.json({ error: "Unknown sourceName" }, { status: 404 });
  }

  const schedule = await prisma.sourceReleaseSchedule.upsert({
    where: { sourceName },
    update: {
      advanceMonths,
      nextExpectedReleaseDate
    },
    create: {
      sourceName,
      advanceMonths,
      nextExpectedReleaseDate
    }
  });

  return NextResponse.json({ schedule });
}
