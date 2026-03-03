export type ReleaseDateConfidence = "OFFICIAL" | "ESTIMATED";

export interface ReleaseScheduleSeedRow {
  sourceName: string;
  advanceMonths: number;
  nextExpectedReleaseDate: string;
  confidence: ReleaseDateConfidence;
  evidenceUrl: string;
  evidenceNote?: string;
}

export const RELEASE_SCHEDULE_RESEARCHED_AT = "2026-02-26T00:00:00.000Z";

export const RELEASE_SCHEDULE_SEED_ROWS: ReleaseScheduleSeedRow[] = [
  {
    sourceName: "University of Michigan Consumer Sentiment",
    advanceMonths: 1,
    nextExpectedReleaseDate: "2026-03-27T12:00:00.000Z",
    confidence: "OFFICIAL",
    evidenceUrl: "https://fred.stlouisfed.org/series/UMCSENT"
  },
  {
    sourceName: "Conference Board Consumer Confidence",
    advanceMonths: 1,
    nextExpectedReleaseDate: "2026-03-31T12:00:00.000Z",
    confidence: "OFFICIAL",
    evidenceUrl: "https://www.conference-board.org/topics/consumer-confidence"
  },
  {
    sourceName: "NY Fed Consumer Expectations - Inflation",
    advanceMonths: 1,
    nextExpectedReleaseDate: "2026-03-10T12:00:00.000Z",
    confidence: "OFFICIAL",
    evidenceUrl: "https://fred.stlouisfed.org/series/MEDCPIM158SFRBCLE"
  },
  {
    sourceName: "Duke/Fed CFO Survey Optimism - Economy",
    advanceMonths: 3,
    nextExpectedReleaseDate: "2026-03-25T12:00:00.000Z",
    confidence: "ESTIMATED",
    evidenceUrl: "https://www.richmondfed.org/research/national_economy/cfo_survey/data_and_results",
    evidenceNote: "Estimated from quarterly cadence and historical posting window."
  },
  {
    sourceName: "NFIB Small Business Optimism",
    advanceMonths: 1,
    nextExpectedReleaseDate: "2026-03-10T12:00:00.000Z",
    confidence: "OFFICIAL",
    evidenceUrl: "https://www.nfib.com/news/monthly_report/sbet/"
  },
  {
    sourceName: "Business Roundtable CEO Outlook",
    advanceMonths: 3,
    nextExpectedReleaseDate: "2026-04-16T12:00:00.000Z",
    confidence: "OFFICIAL",
    evidenceUrl: "https://fred.stlouisfed.org/series/BRTCEOEOI"
  },
  {
    sourceName: "Duke/Fed CFO Survey Optimism - Own Firm",
    advanceMonths: 3,
    nextExpectedReleaseDate: "2026-03-25T12:00:00.000Z",
    confidence: "ESTIMATED",
    evidenceUrl: "https://www.richmondfed.org/research/national_economy/cfo_survey/data_and_results",
    evidenceNote: "Estimated from quarterly cadence and historical posting window."
  },
  {
    sourceName: "EY-Parthenon CEO Confidence",
    advanceMonths: 3,
    nextExpectedReleaseDate: "2026-05-20T12:00:00.000Z",
    confidence: "ESTIMATED",
    evidenceUrl: "https://www.ey.com/en_gl/newsroom/2026/01/ceo-confidence-holds-steady-despite-economic-and-geopolitical-volatility-ey-survey-finds",
    evidenceNote: "Estimated from latest published release and quarterly cadence."
  },
  {
    sourceName: "Deloitte CFO Confidence",
    advanceMonths: 3,
    nextExpectedReleaseDate: "2026-04-28T12:00:00.000Z",
    confidence: "ESTIMATED",
    evidenceUrl: "https://www.deloitte.com/us/en/insights/topics/leadership/cfo-survey-data-dashboard.html",
    evidenceNote: "Estimated from recurring CFO Signals publication cadence."
  },
  {
    sourceName: "Economic Policy Uncertainty Index (month average)",
    advanceMonths: 1,
    nextExpectedReleaseDate: "2026-03-02T12:00:00.000Z",
    confidence: "ESTIMATED",
    evidenceUrl: "https://www.policyuncertainty.com/us_monthly.html",
    evidenceNote: "Estimated from policyuncertainty.com monthly release cadence."
  },
  {
    sourceName: "NFIB Uncertainty Index",
    advanceMonths: 1,
    nextExpectedReleaseDate: "2026-03-10T12:00:00.000Z",
    confidence: "OFFICIAL",
    evidenceUrl: "https://www.nfib.com/news/monthly_report/sbet/"
  },
  {
    sourceName: "Atlanta Fed SBU Empgrowth Uncert",
    advanceMonths: 1,
    nextExpectedReleaseDate: "2026-03-27T12:00:00.000Z",
    confidence: "OFFICIAL",
    evidenceUrl: "https://fred.stlouisfed.org/series/BUSEMEMPUNCR"
  },
  {
    sourceName: "Atlanta Fed SBU RevGrowth Uncert",
    advanceMonths: 1,
    nextExpectedReleaseDate: "2026-03-27T12:00:00.000Z",
    confidence: "OFFICIAL",
    evidenceUrl: "https://fred.stlouisfed.org/series/BUSEMREVPUNCR"
  },
  {
    sourceName: "OECD Composite Consumer Confidence for United States",
    advanceMonths: 1,
    nextExpectedReleaseDate: "2026-03-15T12:00:00.000Z",
    confidence: "ESTIMATED",
    evidenceUrl: "https://fred.stlouisfed.org/series/USACSCICP02STSAM",
    evidenceNote: "Estimated using latest release lag pattern."
  }
];
