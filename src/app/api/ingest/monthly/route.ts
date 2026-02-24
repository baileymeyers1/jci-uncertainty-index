import { NextResponse } from "next/server";
import { runMonthlyIngest } from "@/lib/ingest/runMonthlyIngest";
import { sendMonthlyApprovalEmail } from "@/lib/approval-email";
import { requireApprovalRecipients } from "@/lib/approval-workflow";
import { sendAdminAlert } from "@/lib/brevo";
import { requireSession, unauthorized } from "@/lib/auth-guard";

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) return unauthorized();
  try {
    const recipients = await requireApprovalRecipients();
    const body = await req.json().catch(() => ({}));
    const target = body?.month ? new Date(body.month) : undefined;
    const result = await runMonthlyIngest(target);
    await sendMonthlyApprovalEmail(result.month);
    const warningHtml = result.warnings?.length
      ? `<p>Validation warnings: ${result.warnings.join("; ")}</p>`
      : "";
    try {
      await sendAdminAlert(
        "JCI Uncertainty Index ingest completed",
        `<p>Monthly ingest completed for ${result.month}. Approval email sent to ${recipients.length} approver(s).</p>${warningHtml}`
      );
    } catch (alertError) {
      console.error("Admin alert failed", alertError);
    }
    return NextResponse.json({ status: "ok", result });
  } catch (error) {
    try {
      await sendAdminAlert(
        "JCI Uncertainty Index ingest failed",
        `<p>Monthly ingest failed: ${error instanceof Error ? error.message : "Unknown error"}</p>`
      );
    } catch (alertError) {
      console.error("Admin alert failed", alertError);
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ingest failed" },
      { status: 500 }
    );
  }
}
