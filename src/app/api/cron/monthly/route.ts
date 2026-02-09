import { NextResponse } from "next/server";
import { runMonthlyIngest } from "@/lib/ingest/runMonthlyIngest";
import { prisma } from "@/lib/prisma";
import { formatMonthLabel } from "@/lib/sheets";
import { generateNewsletterHTML } from "@/lib/newsletter/generate";
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
    const ingestResult = await runMonthlyIngest();

    const monthLabel = formatMonthLabel(new Date());
    const contextEntry = await prisma.contextEntry.findUnique({
      where: { month: monthLabel }
    });

    if (contextEntry) {
      const { html, sourceNotes } = await generateNewsletterHTML({
        monthLabel,
        context1: contextEntry.context1,
        context2: contextEntry.context2,
        context3: contextEntry.context3
      });

      await prisma.draft.create({
        data: {
          month: monthLabel,
          html,
          sourceNotes,
          contextId: contextEntry.id
        }
      });
    }

    const warningHtml = ingestResult.warnings?.length
      ? `<p>Validation warnings: ${ingestResult.warnings.join("; ")}</p>`
      : "";
    await sendAdminAlert(
      "JCI Uncertainty Index monthly automation",
      `<p>Monthly ingest completed for ${ingestResult.month}. Draft ${contextEntry ? "generated" : "skipped (no context)"}.</p>${warningHtml}`
    );

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    await sendAdminAlert(
      "JCI Uncertainty Index monthly automation failed",
      `<p>Monthly automation failed: ${error instanceof Error ? error.message : "Unknown error"}</p>`
    );
    return NextResponse.json({ error: "Automation failed" }, { status: 500 });
  }
}
