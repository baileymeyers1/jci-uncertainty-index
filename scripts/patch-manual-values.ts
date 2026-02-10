import fs from "fs";
import path from "path";
import { patchMonthlyRowPartial, sortSheetByDate } from "../src/lib/sheets";

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    if (!line || line.startsWith("#")) return;
    const idx = line.indexOf("=");
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

loadEnv();

const updates: Record<string, Record<string, number>> = {
  "Nov 2025": {
    "Conference Board Consumer Confidence": 111.6,
    "NFIB Small Business Optimism": 98.2,
    "NFIB Uncertainty Index": 88,
    "EY-Parthenon CEO Confidence": 83,
    "Deloitte CFO Confidence": 5.7,
    "Business Roundtable CEO Outlook": 76
  },
  "Dec 2025": {
    "Conference Board Consumer Confidence": 109.5,
    "NFIB Small Business Optimism": 99,
    "NFIB Uncertainty Index": 91,
    "EY-Parthenon CEO Confidence": 83,
    "Deloitte CFO Confidence": 5.7,
    "Business Roundtable CEO Outlook": 76
  },
  "Jan 2026": {
    "Conference Board Consumer Confidence": 94.2,
    "NFIB Small Business Optimism": 99.5,
    "NFIB Uncertainty Index": 84,
    "EY-Parthenon CEO Confidence": 83,
    "Deloitte CFO Confidence": 6.6,
    "Business Roundtable CEO Outlook": 80
  },
  "Feb 2026": {
    "Conference Board Consumer Confidence": 84.5,
    "NFIB Small Business Optimism": 99.3,
    "NFIB Uncertainty Index": 91,
    "EY-Parthenon CEO Confidence": 78.5,
    "Deloitte CFO Confidence": 6.6,
    "Business Roundtable CEO Outlook": 80
  }
};

async function run() {
  for (const [month, values] of Object.entries(updates)) {
    await patchMonthlyRowPartial({
      sheetName: "Data",
      dateLabel: month,
      data: values
    });
  }
  await sortSheetByDate("Data");
}

run()
  .then(() => {
    console.log("Manual values patched.");
  })
  .catch((error) => {
    console.error("Failed to patch manual values", error);
    process.exit(1);
  });
