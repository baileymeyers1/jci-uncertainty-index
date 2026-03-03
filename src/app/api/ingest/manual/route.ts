import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { surveyAdapters } from "@/lib/ingest/adapters/sources";
import { requireSession, unauthorized } from "@/lib/auth-guard";

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function toNumberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const month = String(body?.month ?? "").trim();
  const values =
    body?.values && typeof body.values === "object"
      ? (body.values as Record<string, unknown>)
      : null;

  if (!month || !values) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const run = await prisma.ingestRun.findFirst({
    where: { month },
    orderBy: { startedAt: "desc" },
    include: { sources: true }
  });
  if (!run) {
    return NextResponse.json(
      { error: `No ingest run found for ${month}` },
      { status: 404 }
    );
  }

  const sourceMap = new Map(run.sources.map((source) => [source.sourceName, source]));
  const adapterMap = new Map<string, string>();
  surveyAdapters.forEach((adapter) => {
    adapterMap.set(normalize(adapter.name), adapter.name);
    adapterMap.set(normalize(adapter.sheetHeader), adapter.name);
  });

  const updates: Array<Promise<unknown>> = [];
  for (const [rawKey, rawValue] of Object.entries(values)) {
    const canonicalName = adapterMap.get(normalize(rawKey));
    if (!canonicalName) continue;
    const source = sourceMap.get(canonicalName);
    if (!source) continue;

    const nextValue = toNumberOrNull(rawValue);
    const delta =
      nextValue !== null &&
      source.previousValue !== null &&
      source.previousValue !== undefined
        ? nextValue - source.previousValue
        : null;

    updates.push(
      prisma.sourceValue.update({
        where: { id: source.id },
        data: {
          value: nextValue,
          delta,
          carriedForward: false,
          approvalStatus: "PENDING",
          approvedAt: null,
          approvedByUserId: null
        }
      })
    );
  }

  await Promise.all(updates);

  return NextResponse.json({ status: "ok", updated: updates.length });
}
