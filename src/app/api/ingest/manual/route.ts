import { NextResponse } from "next/server";
import { patchMonthlyRowPartial, sortSheetByDate, syncZScoreDatesFromData } from "@/lib/sheets";
import { requireSession, unauthorized } from "@/lib/auth-guard";

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const month = body?.month;
  const values = body?.values;

  if (!month || typeof month !== "string" || !values || typeof values !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await patchMonthlyRowPartial({
    sheetName: "Data",
    dateLabel: month,
    data: values
  });
  try {
    await syncZScoreDatesFromData();
  } catch (error) {
    console.error("Failed to sync zscores dates", error);
  }

  try {
    await sortSheetByDate("Data");
  } catch (error) {
    console.error("Failed to sort sheet", error);
  }

  return NextResponse.json({ status: "ok" });
}
