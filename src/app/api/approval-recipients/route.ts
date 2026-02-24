import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getApprovalRecipients } from "@/lib/approval-workflow";
import { requireSession, unauthorized } from "@/lib/auth-guard";

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();
  const recipients = await getApprovalRecipients();
  return NextResponse.json({ recipients });
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } }
  });
  if (!user) {
    return NextResponse.json({ error: "User account not found for this email" }, { status: 404 });
  }

  const recipient = await prisma.approvalRecipient.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
    include: { user: true }
  });

  return NextResponse.json({
    recipient: {
      id: recipient.id,
      userId: recipient.userId,
      email: recipient.user.email,
      name: recipient.user.name
    }
  });
}

export async function DELETE(req: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const { id } = body as { id?: string };
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    await prisma.approvalRecipient.delete({ where: { id } });
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Approval recipient not found" }, { status: 404 });
    }
    throw error;
  }
}
