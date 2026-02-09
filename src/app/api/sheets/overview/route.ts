import { NextResponse } from "next/server";
import { getOverviewData } from "@/lib/sheets";
import { requireSession, unauthorized } from "@/lib/auth-guard";

export async function GET() {
  const session = await requireSession();
  if (!session) return unauthorized();
  const data = await getOverviewData();
  return NextResponse.json(data);
}
