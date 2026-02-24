import "server-only";

import { prisma } from "@/lib/prisma";
import { surveyAdapters } from "@/lib/ingest/adapters/sources";
import {
  findRowByDate,
  formatMonthLabel,
  getLatestDataRowMapForMonth,
  getMetaStatsMap,
  getSheetValues,
  normalizeHeader,
  syncZScoreDatesFromData,
  upsertMonthlyRowPartial
} from "@/lib/sheets";
import { format } from "date-fns";
import { advanceSourceReleaseSchedule } from "@/lib/approval-workflow";

export async function runMonthlyIngest(targetMonth?: Date) {
  const monthDate = targetMonth ?? new Date();
  const monthLabel = formatMonthLabel(monthDate);
  const currentMonthLabel = formatMonthLabel(new Date());
  const isHistorical = monthLabel !== currentMonthLabel;

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
    const headerIndexMap = new Map<string, number>();
    headers.forEach((header, idx) => {
      if (header) {
        headerIndexMap.set(normalizeHeader(header), idx);
      }
    });
    const existingRowIndex = findRowByDate(dataSheetValues, monthLabel);
    const existingRow = existingRowIndex !== -1 ? dataSheetValues[existingRowIndex] : null;
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
      const previousValue = parseNumericValue(latestRowMap[normalizedHeader]);
      if (!headerSet.has(normalizedHeader)) {
        await prisma.sourceValue.create({
          data: {
            ingestId: ingestRun.id,
            sourceName: adapter.name,
            sourceUrl: adapter.sourceUrl,
            previousValue,
            delta: null,
            carriedForward: false,
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
          finalValue = previousValue;
          carriedForward = true;
        }

        let lockedValue = false;
        if (isHistorical && existingRow) {
          const existingIdx = headerIndexMap.get(normalizedHeader);
          const existingCell = existingIdx !== undefined ? existingRow[existingIdx] : undefined;
          if (existingCell !== undefined && existingCell !== null && existingCell.toString().trim() !== "") {
            const parsed = Number(existingCell);
            finalValue = Number.isFinite(parsed) ? parsed : null;
            lockedValue = true;
          }
        }

        rowData[normalizedHeader] = finalValue;
        const delta = calculateDelta(finalValue, previousValue);
        const validation = validateValue(normalizedHeader, finalValue, metaStats);
        const status = validation ? "warning" : result.status;
        if (validation) {
          warnings.push(`${adapter.sheetHeader}: ${validation}`);
        }

        const carryMessage = carriedForward ? "Carried forward prior value" : null;
        const lockMessage = lockedValue ? "Preserved locked historical value" : null;

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
            message: [result.message, validation, carryMessage, lockMessage].filter(Boolean).join(" | ") || null
          }
        });

        if (!carriedForward && finalValue !== null && finalValue !== undefined) {
          await advanceSourceReleaseSchedule(adapter.name, result.valueDate ?? monthDate);
        }
      } catch (error) {
        let finalValue: number | null = previousValue;
        let lockedValue = false;
        if (isHistorical && existingRow) {
          const existingIdx = headerIndexMap.get(normalizedHeader);
          const existingCell = existingIdx !== undefined ? existingRow[existingIdx] : undefined;
          if (existingCell !== undefined && existingCell !== null && existingCell.toString().trim() !== "") {
            const parsed = Number(existingCell);
            finalValue = Number.isFinite(parsed) ? parsed : null;
            lockedValue = true;
          }
        }
        rowData[normalizedHeader] = finalValue;
        const delta = calculateDelta(finalValue, previousValue);

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
            status: "failed",
            message: [
              error instanceof Error ? error.message : "Unknown error",
              lockedValue ? "Preserved locked historical value" : null
            ]
              .filter(Boolean)
              .join(" | ")
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
    try {
      await syncZScoreDatesFromData();
    } catch (error) {
      console.error("Failed to sync zscores dates", error);
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

function parseNumericValue(value: string | undefined) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

function calculateDelta(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null;
  return current - previous;
}
