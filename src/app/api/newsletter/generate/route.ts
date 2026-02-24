import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatMonthLabel } from "@/lib/sheets";
import { assertMonthApproved } from "@/lib/approval-workflow";
import { generateNewsletterHTML } from "@/lib/newsletter/generate";
import { requireSession, unauthorized } from "@/lib/auth-guard";

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();
  try {
    const body = await req.json();
    const { context1, context2, context3, month } = body;

    if (!context1 || !context2 || !context3) {
      return NextResponse.json({ error: "Context is required" }, { status: 400 });
    }

    const monthLabel = month ?? formatMonthLabel(new Date());
    const gate = await assertMonthApproved(monthLabel);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.reason }, { status: 409 });
    }

    const contextEntry = await prisma.contextEntry.upsert({
      where: { month: monthLabel },
      update: { context1, context2, context3 },
      create: { month: monthLabel, context1, context2, context3 }
    });

    const { html, sourceNotes } = await generateNewsletterHTML({
      monthLabel,
      context1,
      context2,
      context3
    });

    const draft = await prisma.draft.create({
      data: {
        month: monthLabel,
        html,
        sourceNotes,
        contextId: contextEntry.id,
        status: "DRAFT"
      }
    });

    return NextResponse.json({ draft });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate draft" },
      { status: 500 }
    );
  }
}
