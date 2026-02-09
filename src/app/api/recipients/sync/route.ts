import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncRecipientsToList } from "@/lib/brevo";
import { requireSession, unauthorized } from "@/lib/auth-guard";

export async function POST() {
  const session = await requireSession();
  if (!session) return unauthorized();
  const recipients = await prisma.recipient.findMany();
  await syncRecipientsToList(recipients.map((r) => ({ email: r.email, name: r.name })));
  await prisma.recipientSync.create({ data: { status: "SUCCESS" } });
  return NextResponse.json({ status: "ok" });
}
