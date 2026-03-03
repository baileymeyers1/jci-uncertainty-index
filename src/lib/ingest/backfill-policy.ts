import { monthStart } from "../month";

interface HistoricalAdapterMode {
  supportsHistorical?: boolean;
}

export function isHistoricalIngestTarget(
  targetMonth: Date,
  referenceDate = new Date()
) {
  return monthStart(targetMonth).getTime() < monthStart(referenceDate).getTime();
}

export function shouldUseHistoricalFallback(
  adapter: HistoricalAdapterMode,
  targetMonth: Date,
  referenceDate = new Date()
) {
  if (!isHistoricalIngestTarget(targetMonth, referenceDate)) {
    return false;
  }
  return adapter.supportsHistorical !== true;
}
