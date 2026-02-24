import { NextResponse } from "next/server";
import { runMonthlyIngest } from "@/lib/ingest/runMonthlyIngest";
import { sendMonthlyApprovalEmail } from "@/lib/approval-email";
import { requireApprovalRecipients } from "@/lib/approval-workflow";
import { sendAdminAlert } from "@/lib/brevo";
import { getEnv } from "@/lib/env";

export async function POST(req: Request) {
  const env = getEnv();
  const secret = req.headers.get("x-cron-secret");
  const vercelCron = req.headers.get("x-vercel-cron");
  if (!vercelCron && (!secret || secret !== env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const recipients = await requireApprovalRecipients();
    const ingestResult = await runMonthlyIngest();
    await sendMonthlyApprovalEmail(ingestResult.month);

    const warningHtml = ingestResult.warnings?.length
      ? `<p>Validation warnings: ${ingestResult.warnings.join("; ")}</p>`
      : "";
    try {
      await sendAdminAlert(
        "JCI Uncertainty Index monthly automation",
        `<p>Monthly ingest completed for ${ingestResult.month}. Approval email sent to ${recipients.length} approver(s).</p>${warningHtml}`
      );
    } catch (alertError) {
      console.error("Admin alert failed", alertError);
    }

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    try {
      await sendAdminAlert(
        "JCI Uncertainty Index monthly automation failed",
        `<p>Monthly automation failed: ${error instanceof Error ? error.message : "Unknown error"}</p>`
      );
    } catch (alertError) {
      console.error("Admin alert failed", alertError);
    }
    return NextResponse.json({ error: "Automation failed" }, { status: 500 });
  }
}
