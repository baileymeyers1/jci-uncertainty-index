import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createCampaign, sendTransactionalEmail } from "@/lib/brevo";
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
    const campaign = await createCampaign({
      name: `JCI Uncertainty Index ${draft.month} (manual)`,
      subject,
      html: draft.html,
      scheduledAt: new Date().toISOString()
    });
    return NextResponse.json({ status: "ok", campaignId: campaign.id });
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

  return NextResponse.json({ status: "ok", sent: recipients.length });
}
