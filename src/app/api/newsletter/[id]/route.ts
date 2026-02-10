import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, unauthorized } from "@/lib/auth-guard";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const body = await req.json();
  const { html } = body;
  if (!html) {
    return NextResponse.json({ error: "html is required" }, { status: 400 });
  }

  const draft = await prisma.draft.update({
    where: { id: params.id },
    data: { html }
  });

  return NextResponse.json({ draft });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const draft = await prisma.draft.findUnique({
    where: { id: params.id },
    include: { sendSchedule: true }
  });

  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  if (draft.status === "QUEUED" || draft.sendSchedule?.status === "QUEUED") {
    return NextResponse.json({ error: "Queued drafts cannot be deleted." }, { status: 409 });
  }

  await prisma.sendSchedule.deleteMany({ where: { draftId: draft.id } });
  await prisma.draft.delete({ where: { id: draft.id } });

  return NextResponse.json({ status: "ok" });
}
