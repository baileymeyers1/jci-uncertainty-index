import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getZScoresForMonths } from "@/lib/sheets";
import { requireSession, unauthorized } from "@/lib/auth-guard";

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();

  const ingestRuns = await prisma.ingestRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 5,
    include: { sources: true }
  });

  const monthLabels = ingestRuns.map((run) => run.month);
  const zscoreMap = await getZScoresForMonths(monthLabels);

  const runs = ingestRuns.map((run) => ({
    ...run,
    zscores: zscoreMap.get(run.month) ?? {}
  }));

  return NextResponse.json({ ingestRuns: runs });
}
