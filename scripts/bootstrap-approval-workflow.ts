import { PrismaClient } from "@prisma/client";
import { addMonths } from "date-fns";

const prisma = new PrismaClient();

const sourceScheduleSeed: Array<{ sourceName: string; frequency: "monthly" | "quarterly" | "daily" }> = [
  { sourceName: "University of Michigan Consumer Sentiment", frequency: "monthly" },
  { sourceName: "Conference Board Consumer Confidence", frequency: "monthly" },
  { sourceName: "NY Fed Consumer Expectations - Inflation", frequency: "monthly" },
  { sourceName: "Duke/Fed CFO Survey Optimism - Economy", frequency: "quarterly" },
  { sourceName: "NFIB Small Business Optimism", frequency: "monthly" },
  { sourceName: "Business Roundtable CEO Outlook", frequency: "quarterly" },
  { sourceName: "Duke/Fed CFO Survey Optimism - Own Firm", frequency: "quarterly" },
  { sourceName: "EY-Parthenon CEO Confidence", frequency: "quarterly" },
  { sourceName: "Deloitte CFO Confidence", frequency: "quarterly" },
  { sourceName: "Economic Policy Uncertainty Index (month average)", frequency: "daily" },
  { sourceName: "NFIB Uncertainty Index", frequency: "monthly" },
  { sourceName: "Atlanta Fed SBU Empgrowth Uncert", frequency: "monthly" },
  { sourceName: "Atlanta Fed SBU RevGrowth Uncert", frequency: "monthly" },
  { sourceName: "OECD Composite Consumer Confidence for United States", frequency: "monthly" }
];

function resolveAdvanceMonths(frequency: string) {
  if (frequency === "quarterly") return 3;
  return 1;
}

async function seedSourceSchedules() {
  const now = new Date();
  for (const source of sourceScheduleSeed) {
    const advanceMonths = resolveAdvanceMonths(source.frequency);
    const nextExpectedReleaseDate = addMonths(now, advanceMonths);
    await prisma.sourceReleaseSchedule.upsert({
      where: { sourceName: source.sourceName },
      update: {
        advanceMonths,
        nextExpectedReleaseDate
      },
      create: {
        sourceName: source.sourceName,
        advanceMonths,
        nextExpectedReleaseDate
      }
    });
  }
}

async function autoApproveHistoricalRows() {
  const cutoff = new Date();
  cutoff.setDate(1);
  cutoff.setHours(0, 0, 0, 0);

  await prisma.sourceValue.updateMany({
    where: {
      ingestRun: {
        startedAt: { lt: cutoff }
      }
    },
    data: {
      approvalStatus: "APPROVED",
      approvalNote: "Auto-approved during approval workflow rollout",
      approvedAt: new Date()
    }
  });
}

async function seedApprovalRecipient() {
  const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const user =
    (bootstrapEmail
      ? await prisma.user.findUnique({ where: { email: bootstrapEmail } })
      : null) ?? (await prisma.user.findFirst({ orderBy: { createdAt: "asc" } }));

  if (!user) {
    console.log("No users found; skipping approval recipient bootstrap");
    return;
  }

  await prisma.approvalRecipient.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id }
  });
}

async function main() {
  await seedSourceSchedules();
  await autoApproveHistoricalRows();
  await seedApprovalRecipient();
  console.log("Approval workflow bootstrap complete.");
}

main()
  .catch((error) => {
    console.error("Approval workflow bootstrap failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
