import "server-only";

import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { surveyAdapters } from "@/lib/ingest/adapters/sources";
import { getMetaStatsMap } from "@/lib/analytics";
import { advanceSourceReleaseSchedule } from "@/lib/approval-workflow";
import { formatMonthLabel, monthStart, parseMonthLabel } from "@/lib/month";

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function calculateDelta(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null;
  return current - previous;
}

function validateValue(
  sourceName: string,
  value: number | null,
  metaStats: Map<string, { mean: number | null; stdev: number | null }>
) {
  if (value === null || value === undefined) {
    return "Missing value";
  }

  const stats = metaStats.get(normalizeName(sourceName));
  if (!stats || stats.mean === null || stats.stdev === null || stats.stdev === 0) {
    return null;
  }

  const z = (value - stats.mean) / stats.stdev;
  if (Math.abs(z) >= 4) {
    return `Outlier detected (z=${z.toFixed(2)})`;
  }
  if (value < 0) {
    return "Negative value";
  }
  return null;
}

async function getPreviousValueMap(targetMonth: Date) {
  const targetStart = monthStart(targetMonth);
  const sourceNames = surveyAdapters.map((adapter) => adapter.name);
  const rows = await prisma.sourceValue.findMany({
    where: {
      sourceName: { in: sourceNames },
      ingestRun: { status: "SUCCESS" }
    },
    include: { ingestRun: true },
    orderBy: { ingestRun: { startedAt: "desc" } }
  });

  const map = new Map<string, number | null>();
  for (const row of rows) {
    if (map.has(row.sourceName)) continue;
    const monthDate = parseMonthLabel(row.ingestRun.month);
    if (monthDate && monthStart(monthDate) >= targetStart) continue;
    if (!monthDate && row.ingestRun.startedAt >= targetStart) continue;
    map.set(row.sourceName, row.value);
  }
  return map;
}

export async function runMonthlyIngest(targetMonth?: Date) {
  const monthDate = targetMonth ?? new Date();
  const monthLabel = formatMonthLabel(monthDate);

  const ingestRun = await prisma.ingestRun.create({
    data: {
      month: monthLabel,
      status: "SUCCESS"
    }
  });

  try {
    const [previousValueMap, metaStats] = await Promise.all([
      getPreviousValueMap(monthDate),
      getMetaStatsMap()
    ]);
    const warnings: string[] = [];

    for (const adapter of surveyAdapters) {
      const previousValue = previousValueMap.get(adapter.name) ?? null;

      try {
        const result = await adapter.fetchValue(monthDate);
        let finalValue: number | null = result.value;
        const acceptableStatus =
          result.status === "success" || result.status === "warning";

        let carriedForward = false;
        let carryReason: string | null = null;
        if (finalValue === null || !acceptableStatus) {
          const sourceWasMissing = finalValue === null;
          finalValue = previousValue;
          carriedForward = true;
          carryReason =
            result.message?.trim() ||
            (sourceWasMissing
              ? "Missing source value"
              : `Adapter status ${result.status}`);
        }

        const delta = calculateDelta(finalValue, previousValue);
        const validation = validateValue(adapter.name, finalValue, metaStats);
        const status =
          carriedForward || validation || result.status === "warning"
            ? "warning"
            : result.status;

        if (validation) {
          warnings.push(`${adapter.sheetHeader}: ${validation}`);
        }

        if (carriedForward) {
          warnings.push(
            `${adapter.sheetHeader}: Carry-forward hard warning (${carryReason ?? "Unknown reason"})`
          );
        }

        const carryMessage = carriedForward
          ? `Carried forward prior value (hard warning${carryReason ? `: ${carryReason}` : ""})`
          : null;

        await prisma.sourceValue.create({
          data: {
            ingestId: ingestRun.id,
            sourceName: adapter.name,
            sourceUrl: adapter.sourceUrl,
            value: finalValue,
            previousValue,
            delta,
            carriedForward,
            valueDate: result.valueDate ?? monthDate,
            status,
            message:
              [result.message, validation, carryMessage]
                .filter(Boolean)
                .join(" | ") || null
          }
        });

        if (!carriedForward && finalValue !== null && finalValue !== undefined) {
          await advanceSourceReleaseSchedule(adapter.name, result.valueDate ?? monthDate);
        }
      } catch (error) {
        const finalValue = previousValue;
        const delta = calculateDelta(finalValue, previousValue);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        warnings.push(`${adapter.sheetHeader}: Carry-forward hard warning (${errorMessage})`);

        await prisma.sourceValue.create({
          data: {
            ingestId: ingestRun.id,
            sourceName: adapter.name,
            sourceUrl: adapter.sourceUrl,
            value: finalValue,
            previousValue,
            delta,
            carriedForward: true,
            valueDate: monthDate,
            status: "warning",
            message: [
              errorMessage,
              "Carried forward prior value (hard warning)"
            ]
              .filter(Boolean)
              .join(" | ")
          }
        });
      }
    }

    const message = warnings.length
      ? `Ingest completed with ${warnings.length} validation warnings: ${warnings.join("; ")}`
      : `Ingest completed ${format(new Date(), "PPpp")}`;

    await prisma.ingestRun.update({
      where: { id: ingestRun.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        message
      }
    });

    return { ingestRunId: ingestRun.id, month: monthLabel, warnings };
  } catch (error) {
    await prisma.ingestRun.update({
      where: { id: ingestRun.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        message: error instanceof Error ? error.message : "Unknown error"
      }
    });
    throw error;
  }
}
