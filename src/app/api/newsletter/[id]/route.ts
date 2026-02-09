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
