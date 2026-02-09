import "server-only";

import { getEnv } from "@/lib/env";
import { format } from "date-fns";

interface FREDObservation {
  date: string;
  value: string;
}

async function fetchObservations(params: Record<string, string>) {
  const env = getEnv();
  const query = new URLSearchParams({
    api_key: env.FRED_API_KEY,
    file_type: "json",
    ...params
  });

  const res = await fetch(`https://api.stlouisfed.org/fred/series/observations?${query}`);
  if (!res.ok) {
    throw new Error(`FRED request failed (${res.status})`);
  }

  const data = await res.json();
  return (data?.observations ?? []) as FREDObservation[];
}

export async function fredLatestValue(seriesId: string) {
  const observations = await fetchObservations({
    series_id: seriesId,
    sort_order: "desc",
    limit: "1"
  });

  const obs = observations[0];
  if (!obs || obs.value === ".") return null;
  const value = Number(obs.value);
  if (!Number.isFinite(value)) return null;

  return {
    value,
    date: new Date(obs.date)
  };
}

export async function fredMonthlyAverage(seriesId: string, targetMonth: Date) {
  const start = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
  const end = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);

  const observations = await fetchObservations({
    series_id: seriesId,
    observation_start: format(start, "yyyy-MM-dd"),
    observation_end: format(end, "yyyy-MM-dd")
  });

  const values = observations
    .map((obs) => Number(obs.value))
    .filter((value) => Number.isFinite(value));

  if (!values.length) return null;

  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    value: avg,
    date: end
  };
}
