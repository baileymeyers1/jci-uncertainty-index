import { AdapterResult, SurveyAdapter } from "./types";
import { fredLatestValue, fredMonthlyAverage } from "./fred";
import { getSbuSeriesValue } from "./atlantaFed";
import { getLatestCfoValue } from "./cfoSurvey";
import {\n  scrapeBusinessRoundtableOutlook,\n  scrapeConferenceBoardConfidence,\n  scrapeDeloitteCfoConfidence,\n  scrapeEyParthenonConfidence,\n  scrapeNfibIndices,\n  scrapeNyFedInflationMedian\n} from \"./siteScrapers\";

export const surveyAdapters: SurveyAdapter[] = [
  {
    name: "University of Michigan Consumer Sentiment",
    sheetHeader: "University of Michigan Consumer Sentiment",
    frequency: "monthly",
    sourceUrl: "https://fred.stlouisfed.org/series/UMCSENT",
    releaseCadence: "Monthly",
    fetchValue: async () => {
      const result = await fredLatestValue("UMCSENT");
      if (!result) return { value: null, status: "missing" };
      return { value: result.value, valueDate: result.date, status: "success" };
    }
  },
  {
    name: "Conference Board Consumer Confidence",
    sheetHeader: "Conference Board Consumer Confidence",
    frequency: "monthly",
    sourceUrl: "https://www.conference-board.org/topics/consumer-confidence/",
    releaseCadence: "Monthly",
    fetchValue: async () => {
      const value = await scrapeConferenceBoardConfidence();
      if (value === null) return { value: null, status: "missing" };
      return { value, status: "success" };
    }
  },
  {
    name: "NY Fed Consumer Expectations - inflation",
    sheetHeader: "NY Fed Consumer Expectations - inflation",
    frequency: "monthly",
    sourceUrl: "https://www.newyorkfed.org/microeconomics/sce#/",
    releaseCadence: "Monthly",
    fetchValue: async () => {
      const value = await scrapeNyFedInflationMedian();
      if (value === null) return { value: null, status: "missing" };
      return { value, status: "success" };
    }
  },
  {
    name: "Duke/Fed CFO Survey Optimism - Economy",
    sheetHeader: "Duke/Fed CFO Survey Optimism - Economy",
    frequency: "quarterly",
    sourceUrl: "https://www.richmondfed.org/research/national_economy/cfo_survey/data_and_results",
    releaseCadence: "Quarterly",
    fetchValue: async (targetMonth) => {
      const latest = await getLatestCfoValue(targetMonth);
      if (!latest) return { value: null, status: "missing" };
      return { value: latest.economy, valueDate: latest.date, status: "success" };
    }
  },
  {
    name: "NFIB Small Business Optimism",
    sheetHeader: "NFIB Small Business Optimism",
    frequency: "monthly",
    sourceUrl: "https://www.nfib.com/news/monthly_report/sbet/",
    releaseCadence: "Monthly",
    fetchValue: async () => {
      const { optimism } = await scrapeNfibIndices();
      if (optimism === null) return { value: null, status: "missing" };
      return { value: optimism, status: "success" };
    }
  },
  {
    name: "Business Roundtable CEO Outlook",
    sheetHeader: "Business Roundtable CEO Outlook",
    frequency: "quarterly",
    sourceUrl: "https://www.businessroundtable.org/media/ceo-economic-outlook-index",
    releaseCadence: "Quarterly",
    fetchValue: async () => {
      const value = await scrapeBusinessRoundtableOutlook();
      if (value === null) return { value: null, status: "missing" };
      return { value, status: "success" };
    }
  },
  {
    name: "Duke/Fed CFO Survey Optimism - Own Firm",
    sheetHeader: "Duke/Fed CFO Survey Optimism - Own Firm",
    frequency: "quarterly",
    sourceUrl: "https://www.richmondfed.org/research/national_economy/cfo_survey/data_and_results",
    releaseCadence: "Quarterly",
    fetchValue: async (targetMonth) => {
      const latest = await getLatestCfoValue(targetMonth);
      if (!latest) return { value: null, status: "missing" };
      return { value: latest.ownFirm, valueDate: latest.date, status: "success" };
    }
  },
  {
    name: "EY-Parthenon CEO Confidence",
    sheetHeader: "EY-Parthenon CEO Confidence",
    frequency: "quarterly",
    sourceUrl: "https://www.ey.com/en_us/ceo/ceo-outlook-global-report",
    releaseCadence: "Quarterly",
    fetchValue: async () => {
      const value = await scrapeEyParthenonConfidence();
      if (value === null) return { value: null, status: "missing" };
      return { value, status: "success" };
    }
  },
  {
    name: "Deloitte CFO Confidence",
    sheetHeader: "Deloitte CFO Confidence",
    frequency: "quarterly",
    sourceUrl: "https://www.deloitte.com/us/en/insights/topics/leadership/cfo-survey-data-dashboard.html",
    releaseCadence: "Quarterly",
    fetchValue: async () => {
      const value = await scrapeDeloitteCfoConfidence();
      if (value === null) return { value: null, status: "missing" };
      return { value, status: "success" };
    }
  },
  {
    name: "Economic Policy Uncertainty Index (month average)",
    sheetHeader: "Economic Policy Uncertainty Index (month average)",
    frequency: "daily",
    sourceUrl: "https://fred.stlouisfed.org/series/USEPUINDXD",
    releaseCadence: "Daily",
    fetchValue: async (targetMonth) => {
      const result = await fredMonthlyAverage("USEPUINDXD", targetMonth);
      if (!result) return { value: null, status: "missing" };
      return { value: result.value, valueDate: result.date, status: "success" };
    }
  },
  {
    name: "NFIB Uncertainty Index",
    sheetHeader: "NFIB Uncertainty Index",
    frequency: "monthly",
    sourceUrl: "https://www.nfib.com/news/monthly_report/sbet/",
    releaseCadence: "Monthly",
    fetchValue: async () => {
      const { uncertainty } = await scrapeNfibIndices();
      if (uncertainty === null) return { value: null, status: "missing" };
      return { value: uncertainty, status: "success" };
    }
  },
  {
    name: "Atlanta Fed SBU Empgrowth Uncert",
    sheetHeader: "Atlanta Fed SBU Empgrowth Uncert",
    frequency: "monthly",
    sourceUrl: "https://www.atlantafed.org/research-and-data/surveys/business-uncertainty",
    releaseCadence: "Monthly",
    fetchValue: async (targetMonth) => {
      const result = await getSbuSeriesValue({ targetMonth, series: "empgrowth" });
      if (!result) return { value: null, status: "missing" };
      return { value: result.value, valueDate: result.date, status: "success" };
    }
  },
  {
    name: "Atlanta Fed SBU RevGrowth Uncert",
    sheetHeader: "Atlanta Fed SBU RevGrowth Uncert",
    frequency: "monthly",
    sourceUrl: "https://www.atlantafed.org/research-and-data/surveys/business-uncertainty",
    releaseCadence: "Monthly",
    fetchValue: async (targetMonth) => {
      const result = await getSbuSeriesValue({ targetMonth, series: "revgrowth" });
      if (!result) return { value: null, status: "missing" };
      return { value: result.value, valueDate: result.date, status: "success" };
    }
  },
  {
    name: "OECD Composite Consumer Confidence for United States",
    sheetHeader: "OECD Composite Consumer Confidence for United States",
    frequency: "monthly",
    sourceUrl: "https://fred.stlouisfed.org/series/USACSCICP02STSAM",
    releaseCadence: "Monthly",
    fetchValue: async () => {
      const result = await fredLatestValue("USACSCICP02STSAM");
      if (!result) return { value: null, status: "missing" };
      return { value: result.value, valueDate: result.date, status: "success" };
    }
  }
];
