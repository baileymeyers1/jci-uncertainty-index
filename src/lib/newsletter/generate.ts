import "server-only";

import { braveSearch } from "@/lib/newsletter/brave";
import { callClaude } from "@/lib/newsletter/claude";
import { getOverviewData } from "@/lib/sheets";

const sectionPlans = [
  {
    section: "Index summary",
    queries: ["uncertainty index latest reading", "economic policy uncertainty index latest", "policy uncertainty indicators"],
    sources: ["JCI Uncertainty Index data", "FRED Economic Policy Uncertainty index", "Federal Reserve communications"],
    methods: ["Compare latest index score/z-score to recent trend", "Highlight percentile positioning and month-over-month change"]
  },
  {
    section: "Executive summary",
    queries: ["US uncertainty outlook 2026", "macroeconomic uncertainty drivers 2026", "policy uncertainty risks 2026"],
    sources: ["Federal Reserve statements", "IMF or OECD outlooks", "Major economic data releases"],
    methods: ["Synthesize cross-category drivers into 2-3 headline themes", "Tie themes to data-linked evidence"]
  },
  {
    section: "US policy and key drivers",
    queries: ["US fiscal policy uncertainty", "tariff policy uncertainty", "regulatory uncertainty headlines"],
    sources: ["U.S. Treasury", "Federal Register", "Congressional updates", "policy-focused think tanks"],
    methods: ["Identify policy actions or standoffs driving uncertainty", "Cite official announcements and dates"]
  },
  {
    section: "Consumer sentiment and cultural indicators",
    queries: ["University of Michigan consumer sentiment", "Conference Board consumer confidence", "consumer expectations inflation"],
    sources: ["University of Michigan survey", "Conference Board", "NY Fed SCE"],
    methods: ["Compare survey releases and note divergences", "Tie cultural indicators to economic behavior"]
  },
  {
    section: "Business environment and sector impacts",
    queries: ["CEO confidence survey", "CFO confidence survey", "business outlook index"],
    sources: ["EY CEO survey", "Deloitte CFO survey", "Business Roundtable outlook"],
    methods: ["Highlight sector-specific pressures and capex hiring outlooks", "Connect to market/credit conditions"]
  },
  {
    section: "International and geopolitical factors",
    queries: ["geopolitical risk index", "global uncertainty drivers", "trade policy uncertainty"],
    sources: ["Geopolitical risk trackers", "IMF/OECD releases", "Major central banks"],
    methods: ["Explain external shocks and spillovers into US uncertainty", "Use data-backed examples"]
  },
  {
    section: "Market indicators",
    queries: ["VIX volatility index", "credit spreads widening", "yield curve recession risk"],
    sources: ["CBOE", "FRED market series", "major banks research"],
    methods: ["Use market-based indicators to quantify risk sentiment", "Compare to prior month"]
  },
  {
    section: "Contextual analysis",
    queries: ["US uncertainty drivers February 2026", "policy uncertainty analysis February 2026"],
    sources: ["Context inputs provided", "Major macro releases", "Sector-specific reports"],
    methods: ["Explicitly incorporate all provided context inputs", "Explain how they amplify or offset uncertainty"]
  },
  {
    section: "Forward-looking analysis",
    queries: ["US economic outlook uncertainty next quarter", "Fed projections uncertainty", "recession probability forecast"],
    sources: ["Federal Reserve projections", "IMF forecasts", "private-sector forecasts"],
    methods: ["Lay out 2-3 scenarios with probabilities", "Identify leading indicators to watch next month"]
  }
];

const priorityOutlets = [
  "New York Times",
  "AP News",
  "Reuters",
  "Los Angeles Times",
  "Wall Street Journal",
  "Financial Times",
  "BBC",
  "Politico",
  "Bloomberg",
  "The Guardian",
  "Forbes",
  "Axios",
  "Al Jazeera"
];

export async function generateNewsletterHTML(params: {
  monthLabel: string;
  context1: string;
  context2: string;
  context3: string;
}) {
  const overview = await getOverviewData();
  const latest = overview.latest;
  const indexSeries = overview.indexSeries ?? [];
  const lastIndexPoints = indexSeries.filter((point) => point.indexScore !== null);
  const latestPoint = lastIndexPoints.length ? lastIndexPoints[lastIndexPoints.length - 1] : null;
  const prevPoint = lastIndexPoints.length > 1 ? lastIndexPoints[lastIndexPoints.length - 2] : null;
  const momChange =
    latestPoint?.indexScore !== null && latestPoint?.indexScore !== undefined && prevPoint?.indexScore !== null && prevPoint?.indexScore !== undefined
      ? latestPoint.indexScore - prevPoint.indexScore
      : null;

  const trendPoints = lastIndexPoints.slice(-3);
  const trendValues = trendPoints
    .map((point) => point.indexScore)
    .filter((value): value is number => value !== null && value !== undefined);
  const trendLabels = trendPoints.map((point) => point.date);
  const trendSparkline = trendValues.length >= 2 ? buildSparklineSvg(trendValues, "#c52127") : "";
  const percentile =
    latest.percentile !== null && latest.percentile !== undefined
      ? latest.percentile <= 1
        ? Math.round(latest.percentile * 100 * 100) / 100
        : latest.percentile
      : null;

  const searchBundles = await Promise.all(
    sectionPlans.map(async (plan, idx) => {
      const outletQueries = [
        `${priorityOutlets[idx % priorityOutlets.length]} ${plan.section} ${params.monthLabel} uncertainty`,
        `${priorityOutlets[(idx + 4) % priorityOutlets.length]} ${plan.section} ${params.monthLabel} risk`
      ];
      const queries = [...plan.queries, ...outletQueries];
      const results = await Promise.all(
        queries.map(async (query) => {
          try {
            return await braveSearch(`${query} ${params.monthLabel}`);
          } catch (error) {
            return [] as { title: string; url: string; description: string }[];
          }
        })
      );
      const flattened = results.flat();
      const unique = new Map<string, { title: string; url: string; description: string }>();
      flattened.forEach((item) => {
        if (!unique.has(item.url)) unique.set(item.url, item);
      });
      return {
        section: plan.section,
        queries,
        outletTargets: outletQueries,
        sources: plan.sources,
        methods: plan.methods,
        results: Array.from(unique.values())
      };
    })
  );

  const sourcesText = searchBundles
    .map((bundle) => {
      const searchTerms = bundle.queries.map((q) => `- ${q}`).join("\n");
      const outletTargets = bundle.outletTargets.map((s) => `- ${s}`).join("\n");
      const keySources = bundle.sources.map((s) => `- ${s}`).join("\n");
      const methods = bundle.methods.map((m) => `- ${m}`).join("\n");
      const sources = bundle.results
        .map((r) => `- ${r.title}: ${r.url}`)
        .join("\n");
      return `## ${bundle.section}\nSearch terms:\n${searchTerms}\nPriority outlet targets:\n${outletTargets}\nKey sources:\n${keySources}\nResearch methods:\n${methods}\nSources:\n${sources}`;
    })
    .join("\n\n");

  const prompt = `You are preparing the JCI Uncertainty Index monthly newsletter in HTML format.

Month: ${params.monthLabel}
Index score: ${latest.indexScore ?? "N/A"}
Index z-score: ${latest.indexZ ?? "N/A"}
Index percentile: ${percentile ?? "N/A"}
MoM change (index score): ${momChange !== null ? momChange.toFixed(2) : "N/A"}
Latest month label: ${latestPoint?.date ?? "N/A"}
Previous month label: ${prevPoint?.date ?? "N/A"}
3-month trend labels: ${trendLabels.join(", ") || "N/A"}
3-month trend values: ${trendValues.join(", ") || "N/A"}
3-month trend sparkline (include this HTML in Index summary section):
${trendSparkline || "N/A"}

Context inputs:
1. ${params.context1}
2. ${params.context2}
3. ${params.context3}

Use the following source list to cite inline links in each section:
${sourcesText}

Required sections in this order:
1) Index summary (include score + percentile)
2) Executive summary
3) US policymaking and key drivers
4) Consumer sentiment & cultural indicators
5) Business environment and sector impacts
6) International and geopolitical factors
7) Market indicators
8) Contextual analysis (must include all context inputs)
9) Forward-looking analysis

Requirements:
- Output valid HTML only. Do NOT wrap in markdown or code fences.
- Use a single H1 title: "JCI Uncertainty Index Monthly Newsletter - ${params.monthLabel}".
- Use #c52127 as the primary color for headings, accents, and links. Use email-safe inline styles.
- Every claim or bullet point must include at least one inline link (<a href="...">) to a source.
- Use the sources provided above as primary citations; do not invent sources.
- Each section should clearly reflect the research plan (search terms, key sources, methods) even if you do not output that plan.
- Keep the tone executive, data-rich, and precise. Use short paragraphs and bullet lists where helpful.
- Target 150-200 words per section.
- In the Index summary, explicitly include the MoM change and reference the 3-month trend sparkline.
`;

  const html = sanitizeClaudeHtml(await callClaude(prompt));

  return {
    html,
    sourceNotes: sourcesText
  };
}

function sanitizeClaudeHtml(input: string) {
  let output = input.trim();
  output = output.replace(/^```(?:html)?/i, "");
  output = output.replace(/```$/i, "");
  output = output.replace(/^\s*html\s+/i, "");
  output = output.replace(/^["'`]+/, "").replace(/["'`]+$/, "");
  return output.trim();
}

function buildSparklineSvg(values: number[], color: string) {
  if (values.length < 2) return "";
  const width = 220;
  const height = 60;
  const padding = 6;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = (width - padding * 2) / (values.length - 1);
  const points = values
    .map((value, idx) => {
      const x = padding + idx * step;
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="3-month trend sparkline" style="display:block;margin-top:8px;">
  <rect width="${width}" height="${height}" fill="#fffaf7" />
  <polyline fill="none" stroke="${color}" stroke-width="2" points="${points}" />
</svg>`;
}
