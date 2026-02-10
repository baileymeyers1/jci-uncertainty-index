import { NextResponse } from "next/server";
import { getOverviewData } from "@/lib/sheets";
import { surveyAdapters } from "@/lib/ingest/adapters/sources";
import { requireSession, unauthorized } from "@/lib/auth-guard";

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();
  const data = await getOverviewData();
  const surveyMeta = surveyAdapters.map((adapter) => ({
    survey: adapter.sheetHeader,
    frequency: adapter.frequency,
    sourceUrl: adapter.sourceUrl,
    releaseCadence: adapter.releaseCadence
  }));
  return NextResponse.json({ ...data, surveyMeta });
}
