import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatMonthLabel } from "@/lib/sheets";
import { requireSession, unauthorized } from "@/lib/auth-guard";

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const body = await req.json();
  const { context1, context2, context3, month } = body;
  if (!context1 || !context2 || !context3) {
    return NextResponse.json({ error: "All three context fields are required" }, { status: 400 });
  }

  const monthLabel = month ?? formatMonthLabel(new Date());

  const entry = await prisma.contextEntry.upsert({
    where: { month: monthLabel },
    update: { context1, context2, context3 },
    create: { month: monthLabel, context1, context2, context3 }
  });

  return NextResponse.json({ entry });
}
