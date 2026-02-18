import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createCampaign, deleteCampaign } from "@/lib/brevo";
import { requireSession, unauthorized } from "@/lib/auth-guard";

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const body = await req.json();
  const { draftId } = body;
  if (!draftId) {
    return NextResponse.json({ error: "draftId is required" }, { status: 400 });
  }

  const existingQueue = await prisma.sendSchedule.findFirst({
    where: { status: "QUEUED" }
  });
  if (existingQueue) {
    return NextResponse.json(
      { error: "A draft is already queued. Please cancel or send it before queueing another." },
      { status: 409 }
    );
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

  await prisma.sendLog.create({
    data: {
      draftId: draft.id,
      month: draft.month,
      mode: "QUEUED",
      status: "QUEUED",
      brevoId: String(campaign.id),
      scheduledAt,
      message: "Scheduled for monthly send"
    }
  });

  return NextResponse.json({ schedule });
}

export async function DELETE(req: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const body = await req.json();
  const { draftId } = body as { draftId?: string };
  if (!draftId) {
    return NextResponse.json({ error: "draftId is required" }, { status: 400 });
  }

  const schedule = await prisma.sendSchedule.findUnique({
    where: { draftId }
  });

  let brevoWarning: string | null = null;

  if (schedule?.brevoId) {
    try {
      await deleteCampaign(schedule.brevoId);
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status !== 404) {
        brevoWarning = "Brevo cancel failed";
      }
    }
  }

  if (schedule) {
    await prisma.sendSchedule.delete({ where: { id: schedule.id } });
    const draft = await prisma.draft.update({
      where: { id: schedule.draftId },
      data: { status: "DRAFT" }
    });

    await prisma.sendLog.create({
      data: {
        draftId: draft.id,
        month: draft.month,
        mode: "QUEUED",
        status: "CANCELLED",
        brevoId: schedule.brevoId ?? null,
        scheduledAt: schedule.scheduledAt,
        message: brevoWarning ? `Queued send cancelled. ${brevoWarning}` : "Queued send cancelled"
      }
    });
  } else {
    const draft = await prisma.draft.findUnique({ where: { id: draftId } });
    if (draft?.status === "QUEUED") {
      await prisma.draft.update({
        where: { id: draftId },
        data: { status: "DRAFT" }
      });
      await prisma.sendLog.create({
        data: {
          draftId: draft.id,
          month: draft.month,
          mode: "QUEUED",
          status: "CANCELLED",
          message: brevoWarning
            ? `Queued send cancelled without schedule. ${brevoWarning}`
            : "Queued send cancelled without schedule"
        }
      });
    } else {
      return NextResponse.json({ error: "Queued draft not found" }, { status: 404 });
    }
  }

  return NextResponse.json({ status: "ok", warning: brevoWarning });
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
