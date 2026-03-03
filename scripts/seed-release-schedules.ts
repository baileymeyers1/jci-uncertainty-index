import { PrismaClient } from "@prisma/client";
import {
  RELEASE_SCHEDULE_RESEARCHED_AT,
  RELEASE_SCHEDULE_SEED_ROWS
} from "./release-schedule-seed-data";

const prisma = new PrismaClient();

async function main() {
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

  console.log(
    `Seeded ${RELEASE_SCHEDULE_SEED_ROWS.length} source release schedules (researched ${RELEASE_SCHEDULE_RESEARCHED_AT}).`
  );
}

main()
  .catch((error) => {
    console.error("Failed to seed release schedules", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
