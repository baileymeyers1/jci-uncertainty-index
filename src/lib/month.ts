import { format, isValid, parse } from "date-fns";

export function formatMonthLabel(date: Date) {
  return format(date, "MMM yyyy");
}

export function parseMonthLabel(label: string | undefined | null) {
  if (!label) return null;
  const trimmed = label.toString().trim();
  if (!trimmed) return null;
  const parsedMonth = parse(trimmed, "MMM yyyy", new Date());
  if (isValid(parsedMonth)) return parsedMonth;
  const fallback = new Date(trimmed);
  return isValid(fallback) ? fallback : null;
}

export function toMonthKey(label: string | undefined | null) {
  const parsed = parseMonthLabel(label);
  if (parsed) return formatMonthLabel(parsed);
  return label ? label.toString().trim() : "";
}

export function compareMonthLabels(a: string, b: string) {
  const aDate = parseMonthLabel(a);
  const bDate = parseMonthLabel(b);
  if (aDate && bDate) return aDate.getTime() - bDate.getTime();
  if (aDate && !bDate) return -1;
  if (!aDate && bDate) return 1;
  return a.localeCompare(b);
}

export function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function resolvePreviousPublishedMonth(targetMonth: Date) {
  return new Date(targetMonth.getFullYear(), targetMonth.getMonth() - 1, 1, 12, 0, 0, 0);
}
