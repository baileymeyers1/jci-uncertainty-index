const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

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
    value = value.replace(/^"+/, "").replace(/"+$/, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

loadEnv();

const updates = {
  "Nov 2025": {
    "NFIB Small Business Optimism": 98.2,
    "NFIB Uncertainty Index": 88,
    "EY-Parthenon CEO Confidence": 83,
    "Deloitte CFO Confidence": 5.7,
    "Business Roundtable CEO Outlook": 76,
    "University of Michigan Consumer Sentiment": 53.6,
    "NY Fed Consumer Expectations - Inflation": 3.24
  },
  "Dec 2025": {
    "NFIB Small Business Optimism": 99,
    "NFIB Uncertainty Index": 91,
    "EY-Parthenon CEO Confidence": 83,
    "Deloitte CFO Confidence": 5.7,
    "Business Roundtable CEO Outlook": 76,
    "University of Michigan Consumer Sentiment": 51,
    "NY Fed Consumer Expectations - Inflation": 3.2
  },
  "Jan 2026": {
    "NFIB Small Business Optimism": 99.5,
    "NFIB Uncertainty Index": 84,
    "EY-Parthenon CEO Confidence": 83,
    "Deloitte CFO Confidence": 6.6,
    "Business Roundtable CEO Outlook": 80,
    "University of Michigan Consumer Sentiment": 52.9,
    "NY Fed Consumer Expectations - Inflation": 3.42
  },
  "Feb 2026": {
    "NFIB Small Business Optimism": 99.3,
    "NFIB Uncertainty Index": 91,
    "EY-Parthenon CEO Confidence": 78.5,
    "Deloitte CFO Confidence": 6.6,
    "Business Roundtable CEO Outlook": 80,
    "University of Michigan Consumer Sentiment": 56.4,
    "NY Fed Consumer Expectations - Inflation": 3.1
  }
};

function getAuth() {
  const email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const key = (process.env.GOOGLE_SHEETS_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!email || !key) {
    throw new Error("Missing GOOGLE_SHEETS_CLIENT_EMAIL or GOOGLE_SHEETS_PRIVATE_KEY in .env");
  }
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
}

async function getSheetValues(sheets, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!A:AZ`
  });
  return res.data.values || [];
}

function normalizeHeader(header) {
  return header.trim().replace(/\s+/g, " ");
}

function normalizeSheetName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getHeaderMap(values) {
  const headers = values[0] || [];
  const map = new Map();
  headers.forEach((header, idx) => {
    if (header) map.set(normalizeHeader(header), idx);
  });
  return map;
}

function findRowByDate(values, dateLabel) {
  return values.findIndex((row, idx) => idx > 0 && row[0] === dateLabel);
}

function columnIndexToLetter(index) {
  let result = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

async function updateRowRange(sheets, sheetName, rowIndex, startCol, endCol, row) {
  const rowNumber = rowIndex + 1;
  const startLetter = columnIndexToLetter(startCol);
  const endLetter = columnIndexToLetter(endCol);
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!${startLetter}${rowNumber}:${endLetter}${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] }
  });
}

async function appendRowRange(sheets, sheetName, endCol, row) {
  const endLetter = columnIndexToLetter(endCol);
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!A:${endLetter}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] }
  });
}

async function getSheetId(sheets, sheetName) {
  const res = await sheets.spreadsheets.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID });
  const titles = (res.data.sheets || [])
    .map((s) => s.properties?.title)
    .filter((title) => typeof title === "string");
  const target = normalizeSheetName(sheetName);
  const sheet = res.data.sheets?.find((s) => normalizeSheetName(s.properties?.title || "") === target);
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) {
    throw new Error(`Sheet ${sheetName} not found. Available: ${titles.join(", ")}`);
  }
  return sheetId;
}

async function copyFormulaRange(sheets, sheetName, sourceRow, targetRow, startCol, endCol) {
  const sheetId = await getSheetId(sheets, sheetName);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    requestBody: {
      requests: [
        {
          copyPaste: {
            source: {
              sheetId,
              startRowIndex: sourceRow,
              endRowIndex: sourceRow + 1,
              startColumnIndex: startCol,
              endColumnIndex: endCol + 1
            },
            destination: {
              sheetId,
              startRowIndex: targetRow,
              endRowIndex: targetRow + 1,
              startColumnIndex: startCol,
              endColumnIndex: endCol + 1
            },
            pasteType: "PASTE_FORMULA"
          }
        }
      ]
    }
  });
}

async function sortSheetByDate(sheets, sheetName, values) {
  const sheetId = await getSheetId(sheets, sheetName);
  const rowCount = values.length;
  const colCount = values[0]?.length ?? 1;
  if (rowCount <= 2) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    requestBody: {
      requests: [
        {
          sortRange: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: rowCount,
              startColumnIndex: 0,
              endColumnIndex: colCount
            },
            sortSpecs: [{ dimensionIndex: 0, sortOrder: "ASCENDING" }]
          }
        }
      ]
    }
  });
}

async function patchMonthlyRow(sheets, sheetName, dateLabel, data) {
  const values = await getSheetValues(sheets, sheetName);
  const headers = values[0] || [];
  const headerMap = getHeaderMap(values);
  const indexCol = headers.findIndex((header) => normalizeHeader(header) === "UNCERTAINTY INDEX");
  const maxRawIndex = indexCol > 0 ? indexCol - 1 : headers.length - 1;

  let rowIndex = findRowByDate(values, dateLabel);
  const row = new Array(maxRawIndex + 1).fill("");
  if (rowIndex !== -1) {
    const existing = values[rowIndex] || [];
    for (let i = 0; i <= maxRawIndex; i += 1) {
      row[i] = existing[i] ?? "";
    }
  }
  row[0] = dateLabel;
  Object.entries(data).forEach(([key, value]) => {
    const idx = headerMap.get(normalizeHeader(key));
    if (idx === undefined || idx > maxRawIndex) return;
    row[idx] = value === null || value === undefined ? "" : String(value);
  });

  if (rowIndex === -1) {
    await appendRowRange(sheets, sheetName, maxRawIndex, row);
    const newRowIndex = values.length;
    const computedStart = maxRawIndex + 1;
    const computedEnd = headers.length - 1;
    if (computedStart <= computedEnd && newRowIndex > 1) {
      try {
        await copyFormulaRange(sheets, sheetName, newRowIndex - 1, newRowIndex, computedStart, computedEnd);
      } catch (error) {
        console.error("Formula copy failed", error);
      }
    }
  } else {
    await updateRowRange(sheets, sheetName, rowIndex, 0, maxRawIndex, row);
  }
}

async function ensureZScoreRow(sheets, dateLabel) {
  const values = await getSheetValues(sheets, "zscores");
  const headers = values[0] || [];
  if (!headers.length) return;
  const dateIdx = headers.findIndex((header) => normalizeHeader(header) === "DATE");
  const rowIndex = findRowByDate(values, dateLabel);
  if (rowIndex !== -1) return;

  const dateCol = dateIdx === -1 ? 0 : dateIdx;
  const row = new Array(headers.length).fill("");
  row[dateCol] = dateLabel;
  await appendRowRange(sheets, "zscores", headers.length - 1, row);

  const newRowIndex = values.length;
  const formulaStart = dateCol + 1;
  const formulaEnd = headers.length - 1;
  if (formulaStart <= formulaEnd && newRowIndex > 1) {
    try {
      await copyFormulaRange(sheets, "zscores", newRowIndex - 1, newRowIndex, formulaStart, formulaEnd);
    } catch (error) {
      console.error("Z-score formula copy failed", error);
    }
  }
}

async function syncZScoreDatesFromData(sheets) {
  const dataValues = await getSheetValues(sheets, "Data");
  const zValues = await getSheetValues(sheets, "zscores");
  if (!dataValues.length || !zValues.length) return;

  const dataHeaders = dataValues[0] || [];
  const zHeaders = zValues[0] || [];
  if (!dataHeaders.length || !zHeaders.length) return;

  const dataDateIdx = dataHeaders.findIndex((header) => normalizeHeader(header) === "DATE");
  const zDateIdx = zHeaders.findIndex((header) => normalizeHeader(header) === "DATE");
  if (dataDateIdx === -1) return;

  const zDateCol = zDateIdx === -1 ? 0 : zDateIdx;
  const existing = new Set(
    zValues
      .slice(1)
      .map((row) => (row[zDateCol] ?? "").toString().trim())
      .filter(Boolean)
  );

  let added = 0;
  let zRowCount = zValues.length;

  for (const row of dataValues.slice(1)) {
    const label = row[dataDateIdx];
    if (!label) continue;
    const key = label.toString().trim();
    if (!key || existing.has(key)) continue;

    const newRow = new Array(zHeaders.length).fill("");
    newRow[zDateCol] = label;
    await appendRowRange(sheets, "zscores", zHeaders.length - 1, newRow);
    const newRowIndex = zRowCount;
    zRowCount += 1;

    const formulaStart = zDateCol + 1;
    const formulaEnd = zHeaders.length - 1;
    if (formulaStart <= formulaEnd && newRowIndex > 1) {
      try {
        await copyFormulaRange(sheets, "zscores", newRowIndex - 1, newRowIndex, formulaStart, formulaEnd);
      } catch (error) {
        console.error("Z-score formula copy failed", error);
      }
    }

    existing.add(key);
    added += 1;
  }

  if (added > 0) {
    const updated = await getSheetValues(sheets, "zscores");
    await sortSheetByDate(sheets, "zscores", updated);
  }
}

async function run() {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  for (const [month, values] of Object.entries(updates)) {
    await patchMonthlyRow(sheets, "Data", month, values);
    await ensureZScoreRow(sheets, month);
  }
  await syncZScoreDatesFromData(sheets);
  const updated = await getSheetValues(sheets, "Data");
  await sortSheetByDate(sheets, "Data", updated);
  console.log("Manual values patched.");
}

run().catch((error) => {
  console.error("Failed to patch manual values", error);
  process.exit(1);
});
