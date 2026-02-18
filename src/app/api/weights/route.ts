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
  const metaEntries = Array.from(metaMap.entries());
  const zEntries = Object.entries(latestZ);

  function matchMeta(key: string) {
    const direct = metaMap.get(key);
    if (direct) return direct;
    const lower = key.toLowerCase();
    for (const [metaKey, entry] of metaEntries) {
      if (metaKey.toLowerCase() === lower) return entry;
    }
    for (const [metaKey, entry] of metaEntries) {
      const metaLower = metaKey.toLowerCase();
      if (metaLower.startsWith(lower) || lower.startsWith(metaLower)) return entry;
    }
    return undefined;
  }

  function matchZ(key: string) {
    if (latestZ[key] !== undefined) return latestZ[key];
    const lower = key.toLowerCase();
    for (const [zKey, value] of zEntries) {
      if (zKey.toLowerCase() === lower) return value;
    }
    for (const [zKey, value] of zEntries) {
      const zLower = zKey.toLowerCase();
      if (zLower.startsWith(lower) || lower.startsWith(zLower)) return value;
    }
    return null;
  }
  const entries = surveyAdapters.map((adapter) => {
    const key = normalizeHeader(adapter.sheetHeader);
    const meta = matchMeta(key);
    const latestValueRaw = latestRow[key];
    const latestValue = latestValueRaw !== undefined && latestValueRaw !== "" ? Number(latestValueRaw) : null;
    const isEpu = key.toLowerCase().includes("economic policy uncertainty index");
    const fallbackMean = isEpu ? 116.7817 : null;
    const fallbackStdev = isEpu ? 71.0487 : null;
    return {
      survey: adapter.sheetHeader,
      weight: meta?.weight ?? null,
      mean: meta?.mean ?? fallbackMean,
      stdev: meta?.stdev ?? fallbackStdev,
      frequency: adapter.frequency,
      sourceUrl: adapter.sourceUrl,
      latestValue: Number.isFinite(latestValue) ? latestValue : null,
      latestZ: matchZ(key)
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
