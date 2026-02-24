import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { surveyAdapters } from "@/lib/ingest/adapters/sources";
import { patchMonthlyRowPartial, sortSheetByDate, syncZScoreDatesFromData } from "@/lib/sheets";
import { requireSession, unauthorized } from "@/lib/auth-guard";

type ApprovalAction = "approve" | "reject" | "edit";

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const actorEmail = session.user?.email;
  if (!actorEmail) return unauthorized();
  const actor = await prisma.user.findUnique({ where: { email: actorEmail } });
  if (!actor) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const sourceValueId = String(body?.sourceValueId ?? "").trim();
  const action = String(body?.action ?? "").trim().toLowerCase() as ApprovalAction;
  const note = body?.note ? String(body.note).trim() : null;

  if (!sourceValueId || !action) {
    return NextResponse.json({ error: "sourceValueId and action are required" }, { status: 400 });
  }

  if (!["approve", "reject", "edit"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const sourceValue = await prisma.sourceValue.findUnique({
    where: { id: sourceValueId },
    include: { ingestRun: true }
  });
  if (!sourceValue) {
    return NextResponse.json({ error: "Source value not found" }, { status: 404 });
  }

  if (action === "edit") {
    const rawValue = body?.value;
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      return NextResponse.json({ error: "value is required for edit" }, { status: 400 });
    }
    const nextValue = Number(rawValue);
    if (!Number.isFinite(nextValue)) {
      return NextResponse.json({ error: "value must be numeric" }, { status: 400 });
    }

    const adapter = surveyAdapters.find((entry) => entry.name === sourceValue.sourceName);
    const sheetHeader = adapter?.sheetHeader ?? sourceValue.sourceName;
    await patchMonthlyRowPartial({
      sheetName: "Data",
      dateLabel: sourceValue.ingestRun.month,
      data: {
        [sheetHeader]: nextValue
      }
    });
    await syncZScoreDatesFromData();
    await sortSheetByDate("Data");

    const updated = await prisma.sourceValue.update({
      where: { id: sourceValue.id },
      data: {
        value: nextValue,
        delta:
          sourceValue.previousValue !== null && sourceValue.previousValue !== undefined
            ? nextValue - sourceValue.previousValue
            : null,
        carriedForward: false,
        approvalStatus: "PENDING",
        approvedAt: null,
        approvedByUserId: null,
        approvalNote: note
      }
    });

    return NextResponse.json({ sourceValue: updated });
  }

  const approvalStatus = action === "approve" ? "APPROVED" : "REJECTED";
  const updated = await prisma.sourceValue.update({
    where: { id: sourceValue.id },
    data: {
      approvalStatus,
      approvalNote: note,
      approvedAt: new Date(),
      approvedByUserId: actor.id
    }
  });

  return NextResponse.json({ sourceValue: updated });
}
