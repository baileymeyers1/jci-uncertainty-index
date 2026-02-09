import { NextResponse } from "next/server";
import { runMonthlyIngest } from "@/lib/ingest/runMonthlyIngest";
import { sendAdminAlert } from "@/lib/brevo";
import { requireSession, unauthorized } from "@/lib/auth-guard";

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();
  try {
    const body = await req.json().catch(() => ({}));
    const target = body?.month ? new Date(body.month) : undefined;
    const result = await runMonthlyIngest(target);
    await sendAdminAlert(
      "JCI Uncertainty Index ingest completed",
      `<p>Monthly ingest completed for ${result.month}.</p>${\n        result.warnings?.length\n          ? `<p>Validation warnings: ${result.warnings.join(\"; \")}</p>`\n          : \"\"\n      }`
    );
    return NextResponse.json({ status: "ok", result });
  } catch (error) {
    await sendAdminAlert(
      "JCI Uncertainty Index ingest failed",
      `<p>Monthly ingest failed: ${error instanceof Error ? error.message : "Unknown error"}</p>`
    );
    return NextResponse.json({ error: "Ingest failed" }, { status: 500 });
  }
}
