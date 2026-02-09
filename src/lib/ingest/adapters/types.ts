export type Frequency = "monthly" | "quarterly" | "daily";

export interface AdapterResult {
  value: number | null;
  valueDate?: Date;
  status: "success" | "missing" | "failed" | "warning";
  message?: string;
}

export interface SurveyAdapter {
  name: string;
  sheetHeader: string;
  frequency: Frequency;
  sourceUrl: string;
  releaseCadence: string;
  fetchValue: (targetMonth: Date) => Promise<AdapterResult>;
}
