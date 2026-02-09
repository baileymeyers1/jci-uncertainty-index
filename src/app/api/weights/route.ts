import { NextResponse } from "next/server";
import { getMetaWeights, updateMetaWeight } from "@/lib/sheets";
import { requireSession, unauthorized } from "@/lib/auth-guard";

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();
  const weights = await getMetaWeights();
  return NextResponse.json({ weights });
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const body = await req.json();
  const { survey, weight } = body;
  if (!survey || typeof weight !== "number") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  await updateMetaWeight(survey, weight);
  return NextResponse.json({ status: "ok" });
}
