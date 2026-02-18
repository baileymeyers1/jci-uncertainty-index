import "server-only";

import { braveSearch } from "@/lib/newsletter/brave";
import { callClaude } from "@/lib/newsletter/claude";
import { getOverviewData } from "@/lib/sheets";
import { getEnv } from "@/lib/env";
import { format, isValid, parse } from "date-fns";

const sectionPlans = [
  {
    section: "Index summary",
    queries: ["uncertainty index latest reading", "economic policy uncertainty index latest", "policy uncertainty indicators"],
    sources: ["JCI Uncertainty Index data", "FRED Economic Policy Uncertainty index", "Federal Reserve communications", "Reuters", "AP News", "Washington Post"],
    methods: ["Compare latest index score/z-score to recent trend", "Highlight percentile positioning and month-over-month change"]
  },
  {
    section: "Executive summary",
    queries: ["US uncertainty outlook 2026", "policy uncertainty drivers 2026", "cultural and social uncertainty trends 2026"],
    sources: ["Federal Reserve statements", "IMF or OECD outlooks", "Major economic data releases", "Wall Street Journal", "New York Times", "AP News", "Reuters"],
    methods: ["Synthesize cross-category drivers into 2-3 headline themes with policy + cultural emphasis", "Tie themes to data-linked evidence"]
  },
  {
    section: "US policy and key drivers",
    queries: ["US fiscal policy uncertainty", "tariff policy uncertainty", "regulatory uncertainty headlines", "executive actions policy uncertainty"],
    sources: ["U.S. Treasury", "Federal Register", "Congressional updates", "policy-focused think tanks", "Washington Post", "The Hill", "Reuters"],
    methods: ["Identify policy actions or standoffs driving uncertainty", "Cite official announcements and dates", "Emphasize political and policy uncertainty"]
  },
  {
    section: "Consumer sentiment and cultural indicators",
    queries: ["University of Michigan consumer sentiment", "Conference Board consumer confidence", "consumer expectations inflation", "cultural confidence indicators"],
    sources: ["University of Michigan survey", "Conference Board", "NY Fed SCE", "AP News", "BBC"],
    methods: ["Compare survey releases and note divergences", "Tie cultural indicators to economic behavior", "Highlight shifts in public mood"]
  },
  {
    section: "Business environment and sector impacts",
    queries: ["CEO confidence survey", "CFO confidence survey", "business outlook index"],
    sources: ["EY CEO survey", "Deloitte CFO survey", "Business Roundtable outlook", "Bloomberg", "Financial Times", "Wall Street Journal"],
    methods: ["Highlight sector-specific pressures and capex hiring outlooks", "Connect to market/credit conditions"]
  },
  {
    section: "International and geopolitical factors",
    queries: ["geopolitical risk index", "global uncertainty drivers", "trade policy uncertainty"],
    sources: ["Geopolitical risk trackers", "IMF/OECD releases", "Major central banks", "BBC", "Al Jazeera"],
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
    sources: ["Context inputs provided", "Major macro releases", "Sector-specific reports", "Reuters", "AP News", "Washington Post"],
    methods: ["Use each context input as its own labeled subhead", "Explain how it amplifies or offsets uncertainty"]
  },
  {
    section: "Forward-looking analysis",
    queries: ["US economic outlook uncertainty next quarter", "Fed projections uncertainty", "recession probability forecast"],
    sources: ["Federal Reserve projections", "IMF forecasts", "private-sector forecasts", "Wall Street Journal", "Bloomberg"],
    methods: ["Lay out 2-3 scenarios with probabilities", "Identify leading indicators to watch next month"]
  }
];

const priorityOutlets = [
  "AP News",
  "Reuters",
  "New York Times",
  "Wall Street Journal",
  "BBC",
  "Washington Post",
  "The Hill",
  "Al Jazeera",
  "Bloomberg",
  "Financial Times",
  "Politico",
  "The Guardian",
  "Axios"
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
  const monthDate = parse(params.monthLabel, "MMM yyyy", new Date());
  const dataThrough = isValid(monthDate)
    ? format(new Date(monthDate.getFullYear(), monthDate.getMonth(), 2), "d MMMM yyyy")
    : params.monthLabel;
  const env = getEnv();
  const baseUrl = (env.NEWSLETTER_ASSET_BASE_URL ?? env.NEXTAUTH_URL).replace(/\/$/, "");
  const trendChartUrl = buildChartUrl(baseUrl, "trend", params.monthLabel);
  const sparklineChartUrl = buildChartUrl(baseUrl, "sparkline", params.monthLabel);
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
      const domainCounts = new Map<string, number>();
      const limited = Array.from(unique.values()).filter((item) => {
        try {
          const domain = new URL(item.url).hostname.replace(/^www\./, "");
          const count = domainCounts.get(domain) ?? 0;
          if (count >= 2) return false;
          domainCounts.set(domain, count + 1);
          return true;
        } catch {
          return true;
        }
      });
      return {
        section: plan.section,
        queries,
        outletTargets: outletQueries,
        sources: plan.sources,
        methods: plan.methods,
        results: limited
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
Data through: ${dataThrough}
Context inputs (must be used as subheads in the Contextual analysis section):
- ${params.context1}
- ${params.context2}
- ${params.context3}

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
- Include the line: "Published monthly · Data through ${dataThrough}" directly under the H1 title.
- Do not include charts, sparklines, or metric tables; these are injected separately.
- Every claim or bullet point must include at least one inline link (<a href="...">) to a source.
- Use the sources provided above as primary citations; do not invent sources.
- Avoid linking the phrase "JCI Uncertainty Index" (including in the title or index summary).
- Use a mix of reputable news outlets (e.g., AP, Reuters, NYT, WSJ, BBC, Washington Post, The Hill, Al Jazeera) in every section where applicable.
- Avoid over-referencing any single outlet; diversify citations and avoid repeating one outlet more than twice in a section.
- Maintain a policy-and-culture-forward lens while still covering finance and markets; do not let finance dominate the narrative.
- In the Contextual analysis section, create a subhead for each context input using its exact text (e.g., <h4>Context text</h4>) and follow with 1-2 short paragraphs.
- Each section should clearly reflect the research plan (search terms, key sources, methods) even if you do not output that plan.
- Keep the tone executive, data-rich, and precise. Use short paragraphs and bullet lists where helpful.
- Target 150-200 words per section.
- In the Index summary, explicitly include the MoM change and reference the 3-month trend.
`;

  const rawHtml = await generateClaudeHtml(prompt);
  const normalized = normalizeNewsletterHtml(rawHtml, {
    monthLabel: params.monthLabel,
    dataThrough,
    trendChartUrl,
    sparklineChartUrl,
    indexScore: latest.indexScore,
    indexZ: latest.indexZ,
    percentile,
    momChange,
    prevLabel: prevPoint?.date ?? null
  });

  return {
    html: stripIndexLinks(normalized),
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

async function generateClaudeHtml(prompt: string) {
  const first = await callClaude(prompt, { maxTokens: 8192 });
  let html = sanitizeClaudeHtml(first.text);
  let stopReason = first.stopReason;
  let attempts = 0;

  while (stopReason === "max_tokens" && attempts < 2) {
    const tail = html.slice(-1500);
    const continuationPrompt = `Continue the HTML newsletter from exactly where it left off. Do not repeat the title or any completed sections. Continue immediately after the last character of the existing HTML.

Existing HTML tail:
${tail}

Return HTML only.`;
    const next = await callClaude(continuationPrompt, { maxTokens: 8192, temperature: 0.3 });
    const nextHtml = sanitizeClaudeHtml(next.text);
    html = `${html}${nextHtml}`;
    stopReason = next.stopReason;
    attempts += 1;
  }

  return html;
}

function normalizeNewsletterHtml(
  rawHtml: string,
  params: {
    monthLabel: string;
    dataThrough: string;
    trendChartUrl: string;
    sparklineChartUrl: string;
    indexScore: number | null | undefined;
    indexZ: number | null | undefined;
    percentile: number | null | undefined;
    momChange: number | null;
    prevLabel: string | null;
  }
) {
  let html = sanitizeClaudeHtml(rawHtml);
  html = stripExistingHeaderAssets(html);
  html = stripChartMentions(html);

  const headerBlock = buildHeaderBlock(params.monthLabel, params.dataThrough);
  const indexTrendImage = buildChartImageFromUrl(
    params.trendChartUrl,
    "Index score trend (12-month view)",
    560,
    220
  );
  const sparklineImage = buildChartImageFromUrl(
    params.sparklineChartUrl,
    "3-month trend view",
    420,
    140
  );

  const metricsBlock = buildMetricsBlock({
    indexScore: params.indexScore,
    indexZ: params.indexZ,
    percentile: params.percentile,
    momChange: params.momChange,
    prevLabel: params.prevLabel
  });

  const { indexSummaryBody, restHtml } = extractIndexSummary(html);
  const cleanedSummaryBody = sanitizeIndexSummaryBody(indexSummaryBody);
  const summarySection = buildIndexSummarySection({
    metricsBlock,
    sparklineImage,
    summaryBody: cleanedSummaryBody
  });

  const wrapped = wrapEmailHtml(`${indexTrendImage}${summarySection}${restHtml}`, headerBlock);
  return wrapped;
}

function stripExistingHeaderAssets(html: string) {
  let output = html;
  output = output.replace(/<h1[^>]*>.*?<\/h1>/is, "");
  output = output.replace(/<p[^>]*>[^<]*Published monthly[^<]*<\/p>/i, "");
  output = output.replace(/<p[^>]*data-jci="published-line"[^>]*>.*?<\/p>/is, "");
  output = output.replace(/<svg[^>]*data-jci="index-trend"[\s\S]*?<\/svg>/gi, "");
  output = output.replace(/<svg[^>]*aria-label="3-month trend sparkline"[\s\S]*?<\/svg>/gi, "");
  output = output.replace(/<img[^>]*Index score trend[^>]*>/gi, "");
  output = output.replace(/<img[^>]*trend sparkline[^>]*>/gi, "");
  return output.trim();
}

function buildHeaderBlock(monthLabel: string, dataThrough: string) {
  return `
<table role="presentation" width="100%" style="border-collapse:collapse;background:#c52127;">
  <tr>
    <td style="padding:28px 32px;">
      <h1 style="margin:0;font-size:28px;line-height:1.2;color:#ffffff;font-family:Georgia, 'Times New Roman', serif;">
        JCI Uncertainty Index Monthly Newsletter - ${monthLabel}
      </h1>
      <p style="margin:10px 0 0 0;font-size:14px;line-height:1.4;color:#f6e9ea;font-family:Georgia, 'Times New Roman', serif;">
        Published monthly · Data through ${dataThrough}
      </p>
    </td>
  </tr>
</table>`;
}

function wrapEmailHtml(bodyHtml: string, headerBlock: string) {
  return `
<div style="background:#f7f2ed;padding:24px 0;">
  <table role="presentation" align="center" width="100%" style="max-width:680px;margin:0 auto;border-collapse:collapse;background:#ffffff;border:1px solid #f1e4db;">
    <tr>
      <td style="padding:0;">
        ${headerBlock}
      </td>
    </tr>
    <tr>
      <td style="padding:24px 32px 32px 32px;">
        ${bodyHtml}
      </td>
    </tr>
  </table>
</div>`;
}

function buildChartImageFromUrl(url: string, label: string, width: number, height: number) {
  if (!url) return "";
  return `
<div style="margin:18px 0 6px 0;">
  <img src="${url}" width="${width}" height="${height}" alt="${label}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;" />
  <div style="font-size:12px;color:#7a1d22;margin-top:6px;font-family:Georgia, 'Times New Roman', serif;">${label}</div>
</div>`;
}

function formatPercentile(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A";
  const numeric = value <= 1 ? value * 100 : value;
  const rounded = Math.round(numeric * 10) / 10;
  const suffix = rounded % 10 === 1 && rounded % 100 !== 11
    ? "st"
    : rounded % 10 === 2 && rounded % 100 !== 12
      ? "nd"
      : rounded % 10 === 3 && rounded % 100 !== 13
        ? "rd"
        : "th";
  return `${rounded}${suffix}`;
}

function formatSigned(value: number | null | undefined) {
  if (value === null || value === undefined) return "N/A";
  const rounded = Math.round(value * 100) / 100;
  const sign = rounded >= 0 ? "+" : "";
  return `${sign}${rounded.toFixed(2)}`;
}

function buildMetricsBlock(params: {
  indexScore: number | null | undefined;
  indexZ: number | null | undefined;
  percentile: number | null | undefined;
  momChange: number | null;
  prevLabel: string | null;
}) {
  const indexScore = params.indexScore !== null && params.indexScore !== undefined ? params.indexScore.toFixed(2) : "N/A";
  const percentile = formatPercentile(params.percentile);
  const zScore = formatSigned(params.indexZ);
  const mom = formatSigned(params.momChange);
  const momLabel = params.prevLabel ? `MoM Change` : "MoM Change";
  return `
<table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0 6px 0;">
  <tr>
    <td style="width:25%;padding:12px 10px;background:#fff7f5;">
      <div style="font-size:32px;font-weight:700;color:#c52127;font-family:Georgia, 'Times New Roman', serif;">${indexScore}</div>
      <div style="font-size:12px;color:#7a1d22;letter-spacing:0.08em;text-transform:uppercase;font-family:Arial, sans-serif;">Index Score</div>
    </td>
    <td style="width:25%;padding:12px 10px;background:#fff7f5;">
      <div style="font-size:26px;font-weight:700;color:#1f2933;font-family:Georgia, 'Times New Roman', serif;">${percentile}</div>
      <div style="font-size:12px;color:#7a1d22;letter-spacing:0.08em;text-transform:uppercase;font-family:Arial, sans-serif;">Percentile</div>
    </td>
    <td style="width:25%;padding:12px 10px;background:#fff7f5;">
      <div style="font-size:26px;font-weight:700;color:#1f2933;font-family:Georgia, 'Times New Roman', serif;">${zScore}</div>
      <div style="font-size:12px;color:#7a1d22;letter-spacing:0.08em;text-transform:uppercase;font-family:Arial, sans-serif;">Z-Score</div>
    </td>
    <td style="width:25%;padding:12px 10px;background:#fff7f5;">
      <div style="font-size:26px;font-weight:700;color:#2f7a3e;font-family:Georgia, 'Times New Roman', serif;">${mom}</div>
      <div style="font-size:12px;color:#7a1d22;letter-spacing:0.08em;text-transform:uppercase;font-family:Arial, sans-serif;">${momLabel}</div>
    </td>
  </tr>
</table>`;
}

function stripChartMentions(html: string) {
  let output = html;
  output = output.replace(/<[^>]*>[^<]*4-month view[^<]*<\/[^>]*>/gi, "");
  output = output.replace(/<[^>]*>[^<]*12-month view[^<]*<\/[^>]*>/gi, "");
  output = output.replace(/<[^>]*>[^<]*3-month trend[^<]*<\/[^>]*>/gi, "");
  output = output.replace(/Index score trend\s*\([^)]*\)/gi, "");
  return output;
}

function extractIndexSummary(html: string) {
  const headingRegex = /<h[2-3][^>]*>\s*Index Summary\s*<\/h[2-3]>/i;
  const match = headingRegex.exec(html);
  if (!match) {
    return { indexSummaryBody: "", restHtml: html };
  }
  const start = match.index;
  const afterHeading = start + match[0].length;
  const nextHeadingRegex = /<h[2-3][^>]*>.*?<\/h[2-3]>/gis;
  nextHeadingRegex.lastIndex = afterHeading;
  const nextMatch = nextHeadingRegex.exec(html);
  const end = nextMatch ? nextMatch.index : html.length;
  const indexSummaryBody = html.slice(afterHeading, end);
  const restHtml = `${html.slice(0, start)}${html.slice(end)}`.trim();
  return { indexSummaryBody, restHtml };
}

function sanitizeIndexSummaryBody(html: string) {
  if (!html) return "";
  let output = html;
  output = output.replace(/<table[\s\S]*?<\/table>/gi, "");
  output = output.replace(/<img[\s\S]*?>/gi, "");
  output = output.replace(/<svg[\s\S]*?<\/svg>/gi, "");
  output = output.replace(/<h[1-4][^>]*>.*?<\/h[1-4]>/gi, "");
  output = output.replace(/Index score trend[\s\S]*?<\/p>/gi, "");
  output = output.replace(/3-month trend sparkline[\s\S]*?<\/p>/gi, "");
  return output.trim();
}

function buildIndexSummarySection(params: {
  metricsBlock: string;
  sparklineImage: string;
  summaryBody: string;
}) {
  const heading = `<h2 style="color:#c52127;font-size:22px;margin:28px 0 6px 0;font-family:Georgia, 'Times New Roman', serif;">Index Summary</h2>
<div style="height:3px;width:100%;background:#c52127;margin-bottom:14px;"></div>`;
  const sparklineBlock = params.sparklineImage ? `<div style="margin:10px 0 0 0;">${params.sparklineImage}</div>` : "";
  return `${heading}${params.metricsBlock}${sparklineBlock}${params.summaryBody}`;
}

function buildChartUrl(baseUrl: string, type: "trend" | "sparkline", monthLabel: string) {
  const search = new URLSearchParams({
    type,
    month: monthLabel
  });
  return `${baseUrl}/api/newsletter/charts?${search.toString()}`;
}

function stripIndexLinks(input: string) {
  let html = input;
  html = html.replace(/<a\b[^>]*>\s*(JCI Uncertainty Index)\s*<\/a>/gi, "$1");
  html = html.replace(/<a\b[^>]*>([\s\S]*?JCI Uncertainty Index[\s\S]*?)<\/a>/gi, "$1");
  html = html.replace(/(<h1[^>]*>)([\s\S]*?)(<\/h1>)/i, (match, open, inner, close) => {
    const withoutLinks = inner.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1");
    return `${open}${withoutLinks}${close}`;
  });
  return html;
}
