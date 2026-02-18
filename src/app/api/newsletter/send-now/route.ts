import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/brevo";
import { requireSession, unauthorized } from "@/lib/auth-guard";

type SendMode = "single" | "selected" | "all";

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const body = await req.json();
  const { draftId, mode, recipientIds, recipientEmail } = body as {
    draftId?: string;
    mode?: SendMode;
    recipientIds?: string[];
    recipientEmail?: string;
  };

  if (!draftId || !mode) {
    return NextResponse.json({ error: "draftId and mode are required" }, { status: 400 });
  }

  const draft = await prisma.draft.findUnique({ where: { id: draftId } });
  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  const subject = `JCI Uncertainty Index — ${draft.month}`;

  if (mode === "all") {
    const recipients = await prisma.recipient.findMany({ orderBy: { createdAt: "asc" } });
    if (!recipients.length) {
      return NextResponse.json({ error: "No recipients found" }, { status: 404 });
    }
    try {
      const batchSize = 100;
      for (let i = 0; i < recipients.length; i += batchSize) {
        const chunk = recipients.slice(i, i + batchSize);
        await sendTransactionalEmail({
          subject,
          html: draft.html,
          to: chunk.map((recipient) => ({ email: recipient.email, name: recipient.name }))
        });
      }
      await prisma.sendLog.create({
        data: {
          draftId: draft.id,
          month: draft.month,
          mode: "ALL",
          status: "SENT",
          recipientCount: recipients.length,
          message: "Manual full-list send (transactional)"
        }
      });
      await prisma.draft.update({
        where: { id: draft.id },
        data: { status: "SENT" }
      });
      return NextResponse.json({ status: "ok", sent: recipients.length });
    } catch (error) {
      await prisma.sendLog.create({
        data: {
          draftId: draft.id,
          month: draft.month,
          mode: "ALL",
          status: "FAILED",
          recipientCount: recipients.length,
          message: error instanceof Error ? error.message : "Manual full-list send failed"
        }
      });
      return NextResponse.json({ error: "Failed to send to full list" }, { status: 502 });
    }
  }

  if (mode === "single") {
    if (!recipientEmail) {
      return NextResponse.json({ error: "recipientEmail is required" }, { status: 400 });
    }
    await sendTransactionalEmail({
      subject,
      html: draft.html,
      to: [{ email: recipientEmail }]
    });
    await prisma.sendLog.create({
      data: {
        draftId: draft.id,
        month: draft.month,
        mode: "SINGLE",
        status: "SENT",
        recipientCount: 1,
        recipientEmail,
        message: "Manual single-recipient send"
      }
    });
    return NextResponse.json({ status: "ok", sent: 1 });
  }

  if (!recipientIds?.length) {
    return NextResponse.json({ error: "recipientIds are required" }, { status: 400 });
  }

  const recipients = await prisma.recipient.findMany({
    where: { id: { in: recipientIds } }
  });

  if (!recipients.length) {
    return NextResponse.json({ error: "No recipients found" }, { status: 404 });
  }

  await sendTransactionalEmail({
    subject,
    html: draft.html,
    to: recipients.map((recipient) => ({ email: recipient.email, name: recipient.name }))
  });

  await prisma.sendLog.create({
    data: {
      draftId: draft.id,
      month: draft.month,
      mode: "SELECTED",
      status: "SENT",
      recipientCount: recipients.length,
      message: "Manual selected-recipient send"
    }
  });

  return NextResponse.json({ status: "ok", sent: recipients.length });
}
