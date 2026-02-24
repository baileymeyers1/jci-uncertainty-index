import { NextResponse } from "next/server";
import { formatMonthLabel } from "@/lib/sheets";
import { getApprovalSnapshotForMonth } from "@/lib/approval-workflow";
import { requireSession, unauthorized } from "@/lib/auth-guard";

export async function GET(req: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month")?.trim() || formatMonthLabel(new Date());
  const snapshot = await getApprovalSnapshotForMonth(month);

  if (!snapshot) {
    return NextResponse.json({ month, snapshot: null }, { status: 404 });
  }

  return NextResponse.json({ month, snapshot });
}
