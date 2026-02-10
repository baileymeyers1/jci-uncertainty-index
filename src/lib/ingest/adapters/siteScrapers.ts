import "server-only";

import { fetchPageHtml, htmlToText, matchNumber } from "./scrapeHelpers";

export async function scrapeConferenceBoardConfidence() {
  const html = await fetchPageHtml("https://www.conference-board.org/topics/consumer-confidence/");
  const text = htmlToText(html);
  const value = matchNumber(
    [
      /Consumer Confidence Index[^.]*?to\s+([0-9]+(?:\.[0-9]+)?)/i,
      /Consumer Confidence Index[^.]*?reached\s+([0-9]+(?:\.[0-9]+)?)/i
    ],
    text
  );
  return value;
}

export async function scrapeNyFedInflationMedian() {
  const html = await fetchPageHtml("https://www.newyorkfed.org/microeconomics/sce");
  const text = htmlToText(html);
  const value = matchNumber(
    [
      /Median inflation expectations[^.]*?to\s+([0-9]+(?:\.[0-9]+)?)\s*percent[^.]*one-year-ahead/i,
      /Median inflation expectations[^.]*?to\s+([0-9]+(?:\.[0-9]+)?)\s*percent[^.]*one year/i,
      /Median inflation expectations[^.]*?to\s+([0-9]+(?:\.[0-9]+)?)\s*percent[^.]*one-year-ahead horizon/i,
      /Median inflation expectations[^.]*?one-year-ahead[^.]*?to\s+([0-9]+(?:\.[0-9]+)?)\s*percent/i
    ],
    text
  );
  return value;
}

export async function scrapeNfibIndices() {
  const html = await fetchPageHtml("https://www.nfib.com/news/monthly_report/sbet/");
  const text = htmlToText(html);
  const optimism = matchNumber(
    [
      /Small Business Optimism Index[^.]*?to\s+([0-9]+(?:\.[0-9]+)?)/i,
      /Optimism Index[^.]*?to\s+([0-9]+(?:\.[0-9]+)?)/i
    ],
    text
  );
  const uncertainty = matchNumber(
    [
      /Uncertainty Index[^.]*?to\s+([0-9]+(?:\.[0-9]+)?)/i,
      /Uncertainty Index[^.]*?from[^.]*?to\s+([0-9]+(?:\.[0-9]+)?)/i
    ],
    text
  );
  return { optimism, uncertainty };
}

export async function scrapeBusinessRoundtableOutlook() {
  const html = await fetchPageHtml("https://www.businessroundtable.org/media/ceo-economic-outlook-index");
  const text = htmlToText(html);
  const value = matchNumber(
    [
      /overall Index[^.]*?to\s+([0-9]+(?:\.[0-9]+)?)/i,
      /Index posted[^.]*?to\s+([0-9]+(?:\.[0-9]+)?)/i
    ],
    text
  );
  return value;
}

export async function scrapeEyParthenonConfidence() {
  const html = await fetchPageHtml("https://www.ey.com/en_gl/ceo/ceo-outlook-global-report");
  const text = htmlToText(html);
  const value = matchNumber(
    [
      /Overall sentiment declined from\s+[0-9]+(?:\.[0-9]+)?\s+to\s+([0-9]+(?:\.[0-9]+)?)/i,
      /Overall sentiment rose from\s+[0-9]+(?:\.[0-9]+)?\s+to\s+([0-9]+(?:\.[0-9]+)?)/i
    ],
    text
  );
  return value;
}

export async function scrapeDeloitteCfoConfidence() {
  const html = await fetchPageHtml(
    "https://www.deloitte.com/us/en/insights/topics/leadership/cfo-survey-data-dashboard.html"
  );
  const text = htmlToText(html);
  const value = matchNumber(
    [
      /CFO confidence continues to rise[^0-9]*([0-9]+\.[0-9]+)/i,
      /CFO confidence[^0-9]*([0-9]+\.[0-9]+)/i,
      /The\s+([0-9]+\.[0-9]+)\s+reading marks/i
    ],
    text
  );
  return value;
}
