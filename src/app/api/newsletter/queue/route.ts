import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createCampaign } from "@/lib/brevo";
import { requireSession, unauthorized } from "@/lib/auth-guard";

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const body = await req.json();
  const { draftId } = body;
  if (!draftId) {
    return NextResponse.json({ error: "draftId is required" }, { status: 400 });
  }

  const draft = await prisma.draft.findUnique({ where: { id: draftId } });
  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  const scheduledAt = nextSendDate();
  const campaign = await createCampaign({
    name: `JCI Uncertainty Index ${draft.month}`,
    subject: `JCI Uncertainty Index — ${draft.month}`,
    html: draft.html,
    scheduledAt: scheduledAt.toISOString()
  });

  const schedule = await prisma.sendSchedule.create({
    data: {
      draftId: draft.id,
      scheduledAt,
      status: "QUEUED",
      brevoId: String(campaign.id)
    }
  });

  await prisma.draft.update({
    where: { id: draft.id },
    data: { status: "QUEUED" }
  });

  return NextResponse.json({ schedule });
}

function nextSendDate() {
  const now = new Date();
  const sendDate = new Date(now);
  sendDate.setDate(5);
  sendDate.setHours(9, 0, 0, 0);

  if (sendDate <= now) {
    sendDate.setMonth(sendDate.getMonth() + 1);
  }

  return sendDate;
}
