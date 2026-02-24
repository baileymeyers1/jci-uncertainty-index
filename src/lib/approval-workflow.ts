import "server-only";

import { addMonths, format } from "date-fns";
import { prisma } from "@/lib/prisma";

export type DueState = "PAST_DUE" | "UPCOMING" | "UNKNOWN";

export interface ApprovalRow {
  id: string;
  sourceName: string;
  sourceUrl: string;
  value: number | null;
  previousValue: number | null;
  delta: number | null;
  status: string;
  message: string | null;
  carriedForward: boolean;
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED";
  approvalNote: string | null;
  approvedAt: string | null;
  approvedBy: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  nextExpectedReleaseDate: string | null;
  dueState: DueState;
  dueLabel: string;
}

export interface ApprovalSnapshot {
  month: string;
  ingestRunId: string;
  ingestStatus: string;
  startedAt: string;
  message: string | null;
  allApproved: boolean;
  pendingCount: number;
  sourceCount: number;
  rows: ApprovalRow[];
}

export function formatDueLabel(nextExpectedReleaseDate: Date | null) {
  if (!nextExpectedReleaseDate) {
    return { dueState: "UNKNOWN" as const, dueLabel: "No release date configured" };
  }
  const now = new Date();
  const dueState = nextExpectedReleaseDate < now ? ("PAST_DUE" as const) : ("UPCOMING" as const);
  return {
    dueState,
    dueLabel: `${dueState === "PAST_DUE" ? "Past due" : "Upcoming"} · ${format(nextExpectedReleaseDate, "PPP")}`
  };
}

export async function getApprovalRecipients() {
  const recipients = await prisma.approvalRecipient.findMany({
    include: { user: true },
    orderBy: { createdAt: "asc" }
  });
  return recipients.map((recipient) => ({
    id: recipient.id,
    userId: recipient.userId,
    email: recipient.user.email,
    name: recipient.user.name
  }));
}

export async function requireApprovalRecipients() {
  const recipients = await getApprovalRecipients();
  if (!recipients.length) {
    throw new Error("No approval recipients configured");
  }
  return recipients;
}

export async function getApprovalSnapshotForMonth(month: string): Promise<ApprovalSnapshot | null> {
  const latestRun = await prisma.ingestRun.findFirst({
    where: { month },
    orderBy: { startedAt: "desc" },
    include: {
      sources: {
        include: { approvedByUser: true },
        orderBy: { sourceName: "asc" }
      }
    }
  });

  if (!latestRun) {
    return null;
  }

  const sourceNames = latestRun.sources.map((source) => source.sourceName);
  const schedules = sourceNames.length
    ? await prisma.sourceReleaseSchedule.findMany({
        where: { sourceName: { in: sourceNames } }
      })
    : [];
  const scheduleMap = new Map(schedules.map((entry) => [entry.sourceName, entry]));

  const rows: ApprovalRow[] = latestRun.sources.map((source) => {
    const schedule = scheduleMap.get(source.sourceName);
    const due = formatDueLabel(schedule?.nextExpectedReleaseDate ?? null);
    return {
      id: source.id,
      sourceName: source.sourceName,
      sourceUrl: source.sourceUrl,
      value: source.value,
      previousValue: source.previousValue,
      delta: source.delta,
      status: source.status,
      message: source.message ?? null,
      carriedForward: source.carriedForward,
      approvalStatus: source.approvalStatus,
      approvalNote: source.approvalNote ?? null,
      approvedAt: source.approvedAt ? source.approvedAt.toISOString() : null,
      approvedBy: source.approvedByUser
        ? {
            id: source.approvedByUser.id,
            email: source.approvedByUser.email,
            name: source.approvedByUser.name
          }
        : null,
      nextExpectedReleaseDate: schedule?.nextExpectedReleaseDate?.toISOString() ?? null,
      dueState: due.dueState,
      dueLabel: due.dueLabel
    };
  });

  const pendingCount = rows.filter((row) => row.approvalStatus !== "APPROVED").length;

  return {
    month: latestRun.month,
    ingestRunId: latestRun.id,
    ingestStatus: latestRun.status,
    startedAt: latestRun.startedAt.toISOString(),
    message: latestRun.message ?? null,
    allApproved: rows.length > 0 && pendingCount === 0,
    pendingCount,
    sourceCount: rows.length,
    rows
  };
}

export async function assertMonthApproved(month: string) {
  const snapshot = await getApprovalSnapshotForMonth(month);
  if (!snapshot) {
    return { ok: false as const, reason: `No ingest run found for ${month}. Run scrape first.` };
  }
  if (snapshot.ingestStatus !== "SUCCESS") {
    return { ok: false as const, reason: `Latest ingest for ${month} is not successful.` };
  }
  if (!snapshot.sourceCount) {
    return { ok: false as const, reason: `No source values found for ${month}. Run scrape first.` };
  }
  if (!snapshot.allApproved) {
    return {
      ok: false as const,
      reason: `Approval pending for ${snapshot.pendingCount} source value${snapshot.pendingCount === 1 ? "" : "s"}.`
    };
  }
  return { ok: true as const, snapshot };
}

export async function advanceSourceReleaseSchedule(sourceName: string, referenceDate: Date) {
  const schedule = await prisma.sourceReleaseSchedule.findUnique({
    where: { sourceName }
  });
  if (!schedule) return;

  let next = new Date(schedule.nextExpectedReleaseDate);
  while (next <= referenceDate) {
    next = addMonths(next, schedule.advanceMonths);
  }

  if (next.getTime() !== schedule.nextExpectedReleaseDate.getTime()) {
    await prisma.sourceReleaseSchedule.update({
      where: { id: schedule.id },
      data: { nextExpectedReleaseDate: next }
    });
  }
}
