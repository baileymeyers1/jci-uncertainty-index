import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeMetricsForSources, getMetaBySourceMap } from "@/lib/analytics";
import { requireSession, unauthorized } from "@/lib/auth-guard";

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();

  const [ingestRuns, metaBySource] = await Promise.all([
    prisma.ingestRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 5,
      include: { sources: true }
    }),
    getMetaBySourceMap()
  ]);

  const runs = ingestRuns.map((run) => ({
    ...run,
    zscores: computeMetricsForSources(
      run.sources.map((source) => ({ sourceName: source.sourceName, value: source.value })),
      metaBySource
    ).sourceZScores
  }));

  return NextResponse.json({ ingestRuns: runs });
}
