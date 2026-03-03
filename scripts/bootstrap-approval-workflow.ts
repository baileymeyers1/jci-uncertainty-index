import { PrismaClient } from "@prisma/client";
import {
  RELEASE_SCHEDULE_RESEARCHED_AT,
  RELEASE_SCHEDULE_SEED_ROWS
} from "./release-schedule-seed-data";

const prisma = new PrismaClient();

async function seedSourceSchedules() {
  const researchedAt = new Date(RELEASE_SCHEDULE_RESEARCHED_AT);

  for (const row of RELEASE_SCHEDULE_SEED_ROWS) {
    await prisma.sourceReleaseSchedule.upsert({
      where: { sourceName: row.sourceName },
      update: {
        advanceMonths: row.advanceMonths,
        nextExpectedReleaseDate: new Date(row.nextExpectedReleaseDate),
        confidence: row.confidence,
        evidenceUrl: row.evidenceUrl,
        evidenceNote: row.evidenceNote ?? null,
        lastResearchedAt: researchedAt
      },
      create: {
        sourceName: row.sourceName,
        advanceMonths: row.advanceMonths,
        nextExpectedReleaseDate: new Date(row.nextExpectedReleaseDate),
        confidence: row.confidence,
        evidenceUrl: row.evidenceUrl,
        evidenceNote: row.evidenceNote ?? null,
        lastResearchedAt: researchedAt
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
