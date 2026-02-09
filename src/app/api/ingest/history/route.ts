import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, unauthorized } from "@/lib/auth-guard";

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();

  const ingestRuns = await prisma.ingestRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 5
  });

  return NextResponse.json({ ingestRuns });
}
