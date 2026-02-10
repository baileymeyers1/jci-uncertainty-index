import "server-only";

import { braveSearch } from "@/lib/newsletter/brave";
import { callClaude } from "@/lib/newsletter/claude";
import { getOverviewData } from "@/lib/sheets";

const sections = [
  "Executive summary",
  "US policy and key drivers",
  "Consumer sentiment and cultural indicators",
  "Business environment and sector impacts",
  "International and geopolitical factors",
  "Market indicators",
  "Contextual analysis",
  "Forward-looking analysis"
];

export async function generateNewsletterHTML(params: {
  monthLabel: string;
  context1: string;
  context2: string;
  context3: string;
}) {
  const overview = await getOverviewData();
  const latest = overview.latest;
  const percentile =
    latest.percentile !== null && latest.percentile !== undefined
      ? latest.percentile <= 1
        ? Math.round(latest.percentile * 100 * 100) / 100
        : latest.percentile
      : null;

  const searchBundles = await Promise.all(
    sections.map(async (section) => {
      const query = `${section} uncertainty drivers ${params.monthLabel}`;
      const results = await braveSearch(query);
      return { section, results };
    })
  );

  const sourcesText = searchBundles
    .map((bundle) => {
      const sources = bundle.results
        .map((r) => `- ${r.title}: ${r.url}`)
        .join("\n");
      return `## ${bundle.section}\n${sources}`;
    })
    .join("\n\n");

  const prompt = `You are preparing the JCI Uncertainty Index monthly newsletter in HTML format.

Month: ${params.monthLabel}
Index score: ${latest.indexScore ?? "N/A"}
Index z-score: ${latest.indexZ ?? "N/A"}
Index percentile: ${percentile ?? "N/A"}

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
8) Contextual analysis (use context inputs)
9) Forward-looking analysis

Requirements:
- Output valid HTML only, no markdown.
- Include inline links to sources in each section.
- Keep the tone executive and data-rich.
- Use short paragraphs and bullet lists where helpful.
`;

  const html = await callClaude(prompt);

  return {
    html,
    sourceNotes: sourcesText
  };
}
