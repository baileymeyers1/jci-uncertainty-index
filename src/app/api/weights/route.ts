import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLatestRunValuesAndZScores } from "@/lib/analytics";
import { surveyAdapters } from "@/lib/ingest/adapters/sources";
import { requireSession, unauthorized } from "@/lib/auth-guard";

function normalizeKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function findAdapterBySurvey(survey: string) {
  const key = normalizeKey(survey);
  return surveyAdapters.find(
    (adapter) =>
      normalizeKey(adapter.name) === key ||
      normalizeKey(adapter.sheetHeader) === key
  );
}

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();

  const [metaRows, latest] = await Promise.all([
    prisma.surveyMeta.findMany(),
    getLatestRunValuesAndZScores()
  ]);

  const metaMap = new Map(
    metaRows.map((row) => [normalizeKey(row.sourceName), row])
  );

  const entries = surveyAdapters.map((adapter) => {
    const key = normalizeKey(adapter.name);
    const meta = metaMap.get(key);
    const latestValue = latest.valueMap[adapter.name] ?? null;
    const latestZ = latest.zMap[adapter.name] ?? null;

    return {
      survey: adapter.sheetHeader,
      weight: meta?.weight ?? null,
      mean: meta?.mean ?? null,
      stdev: meta?.stdev ?? null,
      frequency: adapter.frequency,
      sourceUrl: adapter.sourceUrl,
      latestValue,
      latestZ
    };
  });

  return NextResponse.json({ weights: entries });
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const survey = String(body?.survey ?? "").trim();
  const weight = Number(body?.weight);

  if (!survey || !Number.isFinite(weight)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const adapter = findAdapterBySurvey(survey);
  if (!adapter) {
    return NextResponse.json({ error: "Unknown survey" }, { status: 404 });
  }

  await prisma.surveyMeta.upsert({
    where: { sourceName: adapter.name },
    update: { weight },
    create: { sourceName: adapter.name, weight }
  });

  return NextResponse.json({ status: "ok" });
}
