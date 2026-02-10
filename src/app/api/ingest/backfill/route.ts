import { NextResponse } from "next/server";
import { subMonths } from "date-fns";
import { runMonthlyIngest } from "@/lib/ingest/runMonthlyIngest";
import { requireSession, unauthorized } from "@/lib/auth-guard";

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const months = Number(body?.months ?? 4);
  if (!Number.isFinite(months) || months < 1 || months > 24) {
    return NextResponse.json({ error: "Invalid months" }, { status: 400 });
  }

  const results = [];
  for (let i = 0; i < months; i += 1) {
    const target = subMonths(new Date(), i);
    const result = await runMonthlyIngest(target);
    results.push(result);
  }

  return NextResponse.json({ status: "ok", results });
}
