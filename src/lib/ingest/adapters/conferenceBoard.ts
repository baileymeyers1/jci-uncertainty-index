import { endOfMonth } from "date-fns";
import { fetchPageHtml } from "./scrapeHelpers";
import {
  parseConferenceBoardConfidenceFromHtml,
  resolveConferenceBoardTargetMonth
} from "./conferenceBoardParser";

export { parseConferenceBoardConfidenceFromHtml, resolveConferenceBoardTargetMonth };

export async function fetchConferenceBoardConfidence(targetMonth: Date) {
  const html = await fetchPageHtml("https://www.conference-board.org/topics/consumer-confidence/");
  const parsed = parseConferenceBoardConfidenceFromHtml(html, targetMonth);
  const targetReleaseMonth = resolveConferenceBoardTargetMonth(targetMonth);
  if (parsed.value === null) {
    return {
      value: null,
      status: "missing" as const,
      message: parsed.reason
    };
  }

  return {
    value: parsed.value,
    status: "success" as const,
    valueDate: endOfMonth(targetReleaseMonth),
    message: `Matched Conference Board release month ${parsed.matchedMonthLabel}`
  };
}
