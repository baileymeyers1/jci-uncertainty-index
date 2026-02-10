import "server-only";

import { prisma } from "@/lib/prisma";
import { surveyAdapters } from "@/lib/ingest/adapters/sources";
import { formatMonthLabel, getLatestDataRowMapForMonth, getMetaStatsMap, getSheetValues, normalizeHeader, upsertMonthlyRowPartial } from "@/lib/sheets";
import { format } from "date-fns";

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
    const latestRowMap = await getLatestDataRowMapForMonth(monthDate);
    const metaStats = await getMetaStatsMap();
    const dataSheetValues = await getSheetValues("Data");
    const headers = dataSheetValues[0] ?? [];
    const headerSet = new Set(headers.map((h) => (h ? normalizeHeader(h) : "")).filter(Boolean) as string[]);

    const rowData: Record<string, string | number | null> = {};
    const rawHeaderSet = new Set(surveyAdapters.map((adapter) => normalizeHeader(adapter.sheetHeader)));
    let maxRawIndex = 0;
    headers.forEach((header, idx) => {
      if (idx === 0) return;
      if (header && rawHeaderSet.has(normalizeHeader(header))) {
        maxRawIndex = Math.max(maxRawIndex, idx);
      }
    });
    const warnings: string[] = [];

    for (const adapter of surveyAdapters) {
      const normalizedHeader = normalizeHeader(adapter.sheetHeader);
      if (!headerSet.has(normalizedHeader)) {
        await prisma.sourceValue.create({
          data: {
            ingestId: ingestRun.id,
            sourceName: adapter.name,
            sourceUrl: adapter.sourceUrl,
            status: "MISSING_HEADER",
            message: "Sheet header not found"
          }
        });
        continue;
      }

      try {
        const result = await adapter.fetchValue(monthDate);
        let finalValue: number | null = result.value;
        const acceptable = result.status === "success" || result.status === "warning";

        let carriedForward = false;
        if (finalValue === null || !acceptable) {
          const carry = latestRowMap[normalizedHeader];
          finalValue = carry ? Number(carry) : null;
          carriedForward = true;
        }

        rowData[normalizedHeader] = finalValue;
        const validation = validateValue(normalizedHeader, finalValue, metaStats);
        const status = validation ? "warning" : result.status;
        if (validation) {
          warnings.push(`${adapter.sheetHeader}: ${validation}`);
        }

        const carryMessage = carriedForward ? "Carried forward prior value" : null;

        await prisma.sourceValue.create({
          data: {
            ingestId: ingestRun.id,
            sourceName: adapter.name,
            sourceUrl: adapter.sourceUrl,
            value: finalValue,
            valueDate: result.valueDate ?? monthDate,
            status,
            message: [result.message, validation, carryMessage].filter(Boolean).join(" | ") || null
          }
        });
      } catch (error) {
        const carry = latestRowMap[normalizedHeader];
        const finalValue = carry ? Number(carry) : null;
        rowData[normalizedHeader] = finalValue;

        await prisma.sourceValue.create({
          data: {
            ingestId: ingestRun.id,
            sourceName: adapter.name,
            sourceUrl: adapter.sourceUrl,
            value: finalValue,
            valueDate: monthDate,
            status: "failed",
            message: error instanceof Error ? error.message : "Unknown error"
          }
        });
      }
    }

    await upsertMonthlyRowPartial({
      sheetName: "Data",
      dateLabel: monthLabel,
      headerOrder: headers,
      data: rowData,
      maxRawIndex
    });

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

function validateValue(
  survey: string,
  value: number | null,
  metaStats: Map<string, { mean: number | null; stdev: number | null }>
) {
  if (value === null || value === undefined) {
    return "Missing value";
  }
  const stats = metaStats.get(survey);
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
