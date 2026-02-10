import { NextResponse } from "next/server";
import { getLatestDataRowMap, getLatestZScoreRowMap, getMetaWeights, normalizeHeader, updateMetaWeight } from "@/lib/sheets";
import { surveyAdapters } from "@/lib/ingest/adapters/sources";
import { requireSession, unauthorized } from "@/lib/auth-guard";

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();
  const weights = await getMetaWeights();
  const latestRow = await getLatestDataRowMap();
  const latestZ = await getLatestZScoreRowMap();
  const metaMap = new Map(weights.map((row) => [normalizeHeader(row.survey), row]));
  const entries = surveyAdapters.map((adapter) => {
    const key = normalizeHeader(adapter.sheetHeader);
    const meta = metaMap.get(key);
    const latestValueRaw = latestRow[key];
    const latestValue = latestValueRaw !== undefined && latestValueRaw !== "" ? Number(latestValueRaw) : null;
    return {
      survey: adapter.sheetHeader,
      weight: meta?.weight ?? null,
      mean: meta?.mean ?? null,
      stdev: meta?.stdev ?? null,
      frequency: adapter.frequency,
      sourceUrl: adapter.sourceUrl,
      latestValue: Number.isFinite(latestValue) ? latestValue : null,
      latestZ: latestZ[key] ?? null
    };
  });
  return NextResponse.json({ weights: entries });
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const body = await req.json();
  const { survey, weight } = body;
  if (!survey || typeof weight !== "number") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  await updateMetaWeight(survey, weight);
  return NextResponse.json({ status: "ok" });
}
