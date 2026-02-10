"use client";

import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useEffect, useMemo, useState } from "react";

interface IndexPoint {
  date: string;
  indexScore: number | null;
  indexZ: number | null;
  percentile: number | null;
}

interface ZScoreSeries {
  name: string;
  points: { date: string; value: number | null }[];
}

interface RawSeries {
  name: string;
  points: { date: string; value: number | null }[];
}

interface OverviewResponse {
  indexSeries: IndexPoint[];
  zScoreSeries: ZScoreSeries[];
  rawScoreSeries: RawSeries[];
  latest: {
    indexScore: number | null;
    indexZ: number | null;
    percentile: number | null;
    date: string | null;
  };
  surveyMeta: {
    survey: string;
    frequency: string;
    sourceUrl: string;
    releaseCadence: string;
  }[];
}

async function fetchOverview(): Promise<OverviewResponse> {
  const res = await fetch("/api/sheets/overview");
  if (!res.ok) {
    throw new Error("Failed to load overview");
  }
  return res.json();
}

interface IngestRun {
  id: string;
  month: string;
  status: string;
  startedAt: string;
  message?: string | null;
  sources?: {
    id: string;
    sourceName: string;
    value: number | null;
    status: string;
    message?: string | null;
  }[];
  zscores?: Record<string, number | null>;
}

async function fetchIngestHistory(): Promise<{ ingestRuns: IngestRun[] }> {
  const res = await fetch("/api/ingest/history");
  if (!res.ok) {
    throw new Error("Failed to load ingest history");
  }
  return res.json();
}

export function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["overview"],
    queryFn: fetchOverview
  });
  const { data: ingestData } = useQuery({
    queryKey: ["ingest-history"],
    queryFn: fetchIngestHistory
  });
  const [selectedSurvey, setSelectedSurvey] = useState<string | null>(null);
  const [compositeSelection, setCompositeSelection] = useState<Record<string, boolean>>({});
  const surveyMetaMap = useMemo(() => {
    const map = new Map<string, OverviewResponse["surveyMeta"][number]>();
    data?.surveyMeta?.forEach((item) => map.set(item.survey, item));
    return map;
  }, [data]);
  const scaledIndexSeries = useMemo(() => {
    if (!data) return [];
    return data.indexSeries.map((point) => ({
      ...point,
      percentile: scalePercentile(point.percentile)
    }));
  }, [data]);
  const latestPercentile = scalePercentile(data?.latest.percentile ?? null);

  function exportCsv() {
    if (!data) return;
    const headers = ["date", "indexScore", "indexZ", "percentile"];
    const rows = data.indexSeries.map((row) => [
      row.date,
      row.indexScore ?? "",
      row.indexZ ?? "",
      scalePercentile(row.percentile) ?? ""
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "jci-index-series.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportZScoresCsv() {
    if (!data) return;
    const seriesNames = data.zScoreSeries.map((s) => s.name);
    const dateSet = new Set<string>();
    data.zScoreSeries.forEach((series) => {
      series.points.forEach((point) => dateSet.add(point.date));
    });
    const dates = Array.from(dateSet);
    const rows = dates.map((date) => {
      const row: string[] = [date];
      data.zScoreSeries.forEach((series) => {
        const point = series.points.find((p) => p.date === date);
        row.push(point?.value !== null && point?.value !== undefined ? String(point.value) : "");
      });
      return row;
    });
    const csv = [["date", ...seriesNames].join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "jci-zscores.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const selectedSeries = useMemo(() => {
    if (!data?.zScoreSeries?.length) return null;
    const target = selectedSurvey ?? data.zScoreSeries[0].name;
    return data.zScoreSeries.find((series) => series.name === target) ?? data.zScoreSeries[0];
  }, [data, selectedSurvey]);

  const selectedRawSeries = useMemo(() => {
    if (!data?.rawScoreSeries?.length) return null;
    const target = selectedSeries?.name ?? data.rawScoreSeries[0]?.name;
    return data.rawScoreSeries.find((series) => series.name === target) ?? data.rawScoreSeries[0];
  }, [data, selectedSeries]);

  const compositeSeriesList = useMemo(() => data?.zScoreSeries ?? [], [data]);

  useEffect(() => {
    if (!compositeSeriesList.length) return;
    if (Object.keys(compositeSelection).length) return;
    const next: Record<string, boolean> = {};
    compositeSeriesList.forEach((series) => {
      next[series.name] = true;
    });
    setCompositeSelection(next);
  }, [compositeSeriesList, compositeSelection]);

  const selectedChartData = useMemo(() => {
    if (!selectedSeries && !selectedRawSeries) return [];
    const dateSet = new Set<string>();
    selectedSeries?.points.forEach((point) => {
      if (point.date) dateSet.add(point.date);
    });
    selectedRawSeries?.points.forEach((point) => {
      if (point.date) dateSet.add(point.date);
    });
    const dates = Array.from(dateSet).sort(compareDateLabels);
    return dates.map((date) => ({
      date,
      zScore: selectedSeries?.points.find((point) => point.date === date)?.value ?? null,
      rawScore: selectedRawSeries?.points.find((point) => point.date === date)?.value ?? null
    }));
  }, [selectedSeries, selectedRawSeries]);

  const compositeChartData = useMemo(() => {
    if (!data) return [];
    const dateSet = new Set<string>();
    data.zScoreSeries.forEach((series) => {
      series.points.forEach((point) => {
        if (point.date) dateSet.add(point.date);
      });
    });
    data.indexSeries.forEach((point) => {
      if (point.date) dateSet.add(point.date);
    });
    const dates = Array.from(dateSet).sort(compareDateLabels);
    return dates.map((date) => {
      const entry: Record<string, number | null | string> = { date };
      const indexPoint = data.indexSeries.find((point) => point.date === date);
      entry.indexZ = indexPoint?.indexZ ?? null;
      data.zScoreSeries.forEach((series) => {
        entry[series.name] = series.points.find((point) => point.date === date)?.value ?? null;
      });
      return entry;
    });
  }, [data]);

  const compositeColors = [
    "#111418",
    "#3f7d6a",
    "#d95d39",
    "#4f6d7a",
    "#8e6c88",
    "#a37c3c",
    "#3a5a40",
    "#8b5d33",
    "#2f4858",
    "#6d597a",
    "#7a8450",
    "#5f0f40"
  ];

  const compositeColorMap = useMemo(() => {
    const map = new Map<string, string>();
    compositeSeriesList.forEach((series, idx) => {
      map.set(series.name, compositeColors[idx % compositeColors.length]);
    });
    return map;
  }, [compositeSeriesList]);


  if (isLoading) {
    return <p className="subtle">Loading dashboard...</p>;
  }
  if (error || !data) {
    return <p className="text-ember-600">Unable to load dashboard data.</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap justify-end gap-2">
        <button className="button-secondary" onClick={exportCsv}>
          Export Index CSV
        </button>
        <button className="button-secondary" onClick={exportZScoresCsv}>
          Export Z-Scores CSV
        </button>
      </div>
      <section className="grid gap-4 md:grid-cols-3">
        <div className="card p-6">
          <p className="text-sm uppercase tracking-[0.2em] text-ink-600">Index Score</p>
          <p className="mt-2 text-3xl font-serif">{data.latest.indexScore ?? "—"}</p>
          <p className="subtle mt-2">Latest: {data.latest.date ?? "—"}</p>
        </div>
        <div className="card p-6">
          <p className="text-sm uppercase tracking-[0.2em] text-ink-600">Index Z-Score</p>
          <p className="mt-2 text-3xl font-serif">{data.latest.indexZ ?? "—"}</p>
          <p className="subtle mt-2">Latest: {data.latest.date ?? "—"}</p>
        </div>
        <div className="card p-6">
          <p className="text-sm uppercase tracking-[0.2em] text-ink-600">Index Percentile</p>
          <p className="mt-2 text-3xl font-serif">{latestPercentile ?? "—"}</p>
          <p className="subtle mt-2">Latest: {data.latest.date ?? "—"}</p>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="section-title">Index Trends</h2>
        <p className="subtle mt-1">Score, z-score, and percentile over time.</p>
        <div className="mt-6 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={scaledIndexSeries} margin={{ left: 8, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4dfd5" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="indexScore" stroke="#111418" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="indexZ" stroke="#3f7d6a" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="percentile" stroke="#d95d39" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="section-title">Data Validation</h2>
        <p className="subtle mt-1">Latest ingest checks and outlier warnings.</p>
        <div className="mt-4 space-y-3 text-sm">
          {ingestData?.ingestRuns?.length ? (
            ingestData.ingestRuns.map((run) => (
              <details key={run.id} className="border-b border-sand-200 pb-3">
                <summary className="flex cursor-pointer list-none items-center justify-between">
                  <span className="font-medium">{run.month}</span>
                  <span className={run.status === "SUCCESS" ? "text-moss-600" : "text-ember-600"}>
                    {run.status}
                  </span>
                </summary>
                {run.message ? <p className="subtle mt-2">{run.message}</p> : null}
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-ink-600">Raw Values</p>
                    <div className="mt-2 max-h-40 overflow-auto border border-sand-200 rounded-xl">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-ink-600">
                            <th className="py-2 px-3">Survey</th>
                            <th className="py-2 px-3">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {run.sources?.map((source) => (
                            <tr key={source.id} className="border-t border-sand-200">
                              <td className="py-2 px-3">{source.sourceName}</td>
                              <td className="py-2 px-3">{source.value ?? "—"}</td>
                            </tr>
                          )) ?? (
                            <tr>
                              <td className="py-2 px-3" colSpan={2}>
                                —
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-ink-600">Z-Scores</p>
                    <div className="mt-2 max-h-40 overflow-auto border border-sand-200 rounded-xl">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-ink-600">
                            <th className="py-2 px-3">Survey</th>
                            <th className="py-2 px-3">Z</th>
                          </tr>
                        </thead>
                        <tbody>
                          {run.zscores
                            ? Object.entries(run.zscores).map(([name, value]) => (
                                <tr key={name} className="border-t border-sand-200">
                                  <td className="py-2 px-3">{name}</td>
                                  <td className="py-2 px-3">{value ?? "—"}</td>
                                </tr>
                              ))
                            : null}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </details>
            ))
          ) : (
            <p className="subtle">No ingest runs yet.</p>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[2fr,3fr]">
        <div className="card p-6">
          <h2 className="section-title">Survey Z-Scores</h2>
          <p className="subtle mt-1">Latest z-score values by survey.</p>
          <p className="subtle mt-1">
            Normalized: positive values indicate above-average uncertainty, negative values indicate below-average uncertainty.
          </p>
          <div className="mt-4 max-h-[360px] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-600">
                  <th className="py-2">Survey</th>
                  <th className="py-2">Latest Score</th>
                  <th className="py-2">Latest Z</th>
                </tr>
              </thead>
              <tbody>
                {data.zScoreSeries.map((series) => {
                  const latestPoint = [...series.points].reverse().find((p) => p.value !== null);
                  const rawSeries = data.rawScoreSeries.find((entry) => entry.name === series.name);
                  const latestRaw = rawSeries ? [...rawSeries.points].reverse().find((p) => p.value !== null) : null;
                  const meta = surveyMetaMap.get(series.name);
                  const isActive = selectedSeries?.name === series.name;
                  return (
                    <tr
                      key={series.name}
                      className={isActive ? "bg-sand-100" : ""}
                      onClick={() => setSelectedSurvey(series.name)}
                    >
                      <td className="py-2 pr-4 font-medium text-ink-900">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{series.name}</span>
                          {meta ? (
                            <span className="rounded-full border border-sand-300 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-ink-600">
                              {meta.frequency}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2 text-ink-700">{latestRaw?.value ?? "—"}</td>
                      <td className="py-2 text-ink-700">{latestPoint?.value ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card p-6">
          <h2 className="section-title">Selected Survey Trend</h2>
          <p className="subtle mt-1">{selectedSeries?.name ?? "Select a survey"}</p>
          <div className="mt-6 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={selectedChartData}
                margin={{ left: 8, right: 12 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e4dfd5" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} domain={[-3, 3]} />
                <Tooltip content={<SelectedSurveyTooltip />} />
                <Line yAxisId="left" type="monotone" dataKey="zScore" stroke="#111418" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="section-title">Composite Z-Score Trends</h2>
        <p className="subtle mt-1">Overlay of survey z-scores with the index z-score.</p>
        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          {compositeSeriesList.map((series) => (
            <label key={series.name} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={compositeSelection[series.name] ?? false}
                onChange={() =>
                  setCompositeSelection((prev) => ({
                    ...prev,
                    [series.name]: !(prev[series.name] ?? true)
                  }))
                }
              />
              <span style={{ color: compositeColorMap.get(series.name) ?? "#111418" }}>{series.name}</span>
            </label>
          ))}
        </div>
        <div className="mt-6 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={compositeChartData} margin={{ left: 8, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4dfd5" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} domain={[-3, 3]} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="indexZ"
                name="Index Z-Score"
                stroke="#c52127"
                strokeWidth={2}
                dot={false}
              />
              {compositeSeriesList
                .filter((series) => compositeSelection[series.name])
                .map((series) => (
                  <Line
                    key={series.name}
                    type="monotone"
                    dataKey={series.name}
                    name={series.name}
                    stroke={compositeColorMap.get(series.name) ?? "#111418"}
                    strokeWidth={1.5}
                    dot={false}
                  />
                ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

function scalePercentile(value: number | null) {
  if (value === null || value === undefined) return null;
  if (value <= 1) {
    return Math.round(value * 100 * 100) / 100;
  }
  return value;
}

function compareDateLabels(a: string, b: string) {
  const aDate = new Date(a);
  const bDate = new Date(b);
  if (!Number.isNaN(aDate.getTime()) && !Number.isNaN(bDate.getTime())) {
    return aDate.getTime() - bDate.getTime();
  }
  if (!Number.isNaN(aDate.getTime())) return -1;
  if (!Number.isNaN(bDate.getTime())) return 1;
  return a.localeCompare(b);
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString();
}

function SelectedSurveyTooltip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: Array<{ payload?: { zScore?: number | null; rawScore?: number | null } }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload ?? {};
  return (
    <div className="rounded-xl border border-sand-200 bg-white px-3 py-2 text-xs text-ink-900 shadow-sm">
      <p className="font-semibold">{label}</p>
      <p className="mt-1">Z-score: {formatNumber(data.zScore)}</p>
      <p>Raw score: {formatNumber(data.rawScore)}</p>
    </div>
  );
}
