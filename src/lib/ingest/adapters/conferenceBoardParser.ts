import { formatMonthLabel, resolvePreviousPublishedMonth } from "../../month";

export interface ConferenceBoardParseResult {
  value: number | null;
  matchedMonthLabel: string | null;
  reason?: string;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildMonthPattern(date: Date) {
  const longMonth = date.toLocaleString("en-US", { month: "long" }).toLowerCase();
  const shortMonth = date.toLocaleString("en-US", { month: "short" }).toLowerCase().replace(".", "");
  const variants = new Set<string>([longMonth, shortMonth, longMonth.slice(0, 3)]);
  if (longMonth.startsWith("sep")) {
    variants.add("sept");
  }
  return `(?:${Array.from(variants)
    .map((token) => escapeRegExp(token))
    .join("|")})`;
}

function normalizeSourceText(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveConferenceBoardTargetMonth(targetMonth: Date) {
  return resolvePreviousPublishedMonth(targetMonth);
}

export function parseConferenceBoardConfidenceFromHtml(
  input: string,
  targetMonth: Date
): ConferenceBoardParseResult {
  const targetReleaseMonth = resolveConferenceBoardTargetMonth(targetMonth);
  const monthPattern = buildMonthPattern(targetReleaseMonth);
  const text = normalizeSourceText(input);

  const patterns: Array<{ regex: RegExp; valueGroup: number }> = [
    {
      regex: new RegExp(
        `Consumer Confidence Index[\\s\\S]{0,260}?\\b(?:in|for)\\s+${monthPattern}\\b[\\s\\S]{0,200}?\\b(?:to|at|was|is)\\s+([0-9]+(?:\\.[0-9]+)?)`,
        "i"
      ),
      valueGroup: 1
    },
    {
      regex: new RegExp(
        `\\b${monthPattern}\\b[\\s\\S]{0,220}?Consumer Confidence Index[\\s\\S]{0,200}?\\b(?:to|at|was|is)\\s+([0-9]+(?:\\.[0-9]+)?)`,
        "i"
      ),
      valueGroup: 1
    }
  ];

  for (const { regex, valueGroup } of patterns) {
    const match = text.match(regex);
    if (!match?.[valueGroup]) continue;
    const value = Number(match[valueGroup]);
    if (!Number.isFinite(value)) continue;
    if (value <= 0 || value > 200) continue;
    return {
      value,
      matchedMonthLabel: formatMonthLabel(targetReleaseMonth)
    };
  }

  return {
    value: null,
    matchedMonthLabel: null,
    reason: `No match for Conference Board Consumer Confidence in ${formatMonthLabel(
      targetReleaseMonth
    )}`
  };
}
