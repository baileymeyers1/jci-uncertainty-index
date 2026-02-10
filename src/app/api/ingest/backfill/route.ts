import { NextResponse } from "next/server";
import { subMonths } from "date-fns";
import { runMonthlyIngest } from "@/lib/ingest/runMonthlyIngest";
import { formatMonthLabel } from "@/lib/sheets";
import { requireSession, unauthorized } from "@/lib/auth-guard";

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const months = Number(body?.months ?? 4);
  if (!Number.isFinite(months) || months < 1 || months > 24) {
    return NextResponse.json({ error: "Invalid months" }, { status: 400 });
  }

  const results: Array<{ month: string; status: "SUCCESS" | "FAILED"; error?: string }> = [];
  for (let i = 0; i < months; i += 1) {
    const target = subMonths(new Date(), i);
    try {
      const result = await runMonthlyIngest(target);
      results.push({ month: result.month, status: "SUCCESS" });
    } catch (error) {
      results.push({
        month: formatMonthLabel(target),
        status: "FAILED",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  const failed = results.filter((result) => result.status === "FAILED");
  return NextResponse.json({ status: failed.length ? "partial" : "ok", results });
}
