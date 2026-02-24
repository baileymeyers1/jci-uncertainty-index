import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, unauthorized } from "@/lib/auth-guard";

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();
  const drafts = await prisma.draft.findMany({
    orderBy: { createdAt: "desc" }
  });
  const contexts = await prisma.contextEntry.findMany({ orderBy: { createdAt: "desc" } });
  const recipients = await prisma.recipient.findMany({ orderBy: { createdAt: "desc" } });
  const ingestRuns = await prisma.ingestRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 });
  const sendLogs = await prisma.sendLog.findMany({ orderBy: { createdAt: "desc" }, take: 12 });

  return NextResponse.json({ drafts, contexts, recipients, ingestRuns, sendLogs });
}
