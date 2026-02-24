import "server-only";

import { getEnv } from "@/lib/env";
import { sendTransactionalEmail } from "@/lib/brevo";
import { getApprovalSnapshotForMonth, requireApprovalRecipients } from "@/lib/approval-workflow";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumeric(value: number | null) {
  return value === null || value === undefined ? "—" : String(value);
}

export async function sendMonthlyApprovalEmail(month: string) {
  const recipients = await requireApprovalRecipients();
  const snapshot = await getApprovalSnapshotForMonth(month);
  if (!snapshot) {
    throw new Error(`No ingest snapshot found for ${month}`);
  }

  const env = getEnv();
  const reviewUrl = `${env.NEXTAUTH_URL}/?tab=automation&reviewOpen=1&reviewMonth=${encodeURIComponent(month)}`;

  const rows = snapshot.rows
    .map((row) => {
      const statusParts = [row.status];
      if (row.carriedForward) statusParts.push("Carried forward");
      if (row.approvalStatus !== "APPROVED") statusParts.push("Needs approval");
      return `<tr>
  <td style="padding:8px;border:1px solid #ddd;font-weight:600;">${escapeHtml(row.sourceName)}</td>
  <td style="padding:8px;border:1px solid #ddd;">${formatNumeric(row.value)}</td>
  <td style="padding:8px;border:1px solid #ddd;">${formatNumeric(row.previousValue)}</td>
  <td style="padding:8px;border:1px solid #ddd;">${formatNumeric(row.delta)}</td>
  <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(statusParts.join(" · "))}</td>
  <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(row.dueLabel)}</td>
  <td style="padding:8px;border:1px solid #ddd;"><a href="${row.sourceUrl}" target="_blank" rel="noreferrer">Source</a></td>
</tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html>
  <body style="font-family:Arial,sans-serif;color:#111;">
    <h1 style="margin-bottom:8px;">JCI Monthly Data Approval Required (${escapeHtml(month)})</h1>
    <p style="margin-top:0;">Latest scrape captured <strong>${snapshot.sourceCount}</strong> source values. Please review and approve all rows before newsletter send.</p>
    <p><a href="${reviewUrl}" style="color:#c52127;font-weight:700;">Open approval workflow in app</a></p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr>
          <th style="text-align:left;padding:8px;border:1px solid #ddd;">Source</th>
          <th style="text-align:left;padding:8px;border:1px solid #ddd;">Value</th>
          <th style="text-align:left;padding:8px;border:1px solid #ddd;">Previous</th>
          <th style="text-align:left;padding:8px;border:1px solid #ddd;">Delta</th>
          <th style="text-align:left;padding:8px;border:1px solid #ddd;">Status</th>
          <th style="text-align:left;padding:8px;border:1px solid #ddd;">Expected Release</th>
          <th style="text-align:left;padding:8px;border:1px solid #ddd;">Link</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <p style="margin-top:16px;">Workflow: review values, edit flagged rows, approve all rows, update context, generate draft, send manually.</p>
  </body>
</html>`;

  await sendTransactionalEmail({
    subject: `Approval required: JCI Uncertainty Index ${month}`,
    html,
    to: recipients.map((recipient) => ({ email: recipient.email, name: recipient.name }))
  });
}
