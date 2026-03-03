import assert from "node:assert/strict";
import {
  parseConferenceBoardConfidenceFromHtml,
  resolveConferenceBoardTargetMonth
} from "../../src/lib/ingest/adapters/conferenceBoardParser";
import {
  parsePolicyUncertaintyRows,
  selectPolicyUncertaintyValueForTargetMonth
} from "../../src/lib/ingest/adapters/policyUncertainty";
import { resolvePreviousPublishedMonth } from "../../src/lib/month";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const conferenceBoardFixture = `
  <h2 class="textCenter esfIntrotext">US Consumer Confidence Inched Up in February</h2>
  <h3>Latest Press Release</h3>
  <p class="date">Updated: Tuesday, February 24, 2026 </p>
  <p>The Conference Board Consumer Confidence Index increased by 2.2 points in February to 91.2 (1985=100), from an upwardly revised 89.0 in January.</p>
`;

test("Conference Board parser uses prior-month release for Mar 2026 ingest", () => {
  const targetMonth = new Date("2026-03-03T15:00:00.000Z");
  const parsed = parseConferenceBoardConfidenceFromHtml(conferenceBoardFixture, targetMonth);
  assert.equal(parsed.value, 91.2);
  assert.equal(parsed.matchedMonthLabel, "Feb 2026");
});

test("Conference Board parser rejects stale month values", () => {
  const staleFixture = `
    <p>The Conference Board Consumer Confidence Index increased by 1.0 points in January to 84.5 (1985=100).</p>
  `;
  const targetMonth = new Date("2026-03-03T15:00:00.000Z");
  const parsed = parseConferenceBoardConfidenceFromHtml(staleFixture, targetMonth);
  assert.equal(parsed.value, null);
  assert.match(parsed.reason ?? "", /No match/i);
});

test("Policy uncertainty selector uses previous month for Mar 2026 ingest", () => {
  const rows = parsePolicyUncertaintyRows([
    ["Year", "Month", "News_Based_Policy_Uncert_Index"],
    ["2026", 2, 385.9954833984375],
    ["2026", 1, 371.3349609375]
  ]);
  const selected = selectPolicyUncertaintyValueForTargetMonth(rows, new Date("2026-03-03T15:00:00.000Z"));
  assert.equal(selected?.value, 385.9954833984375);
  assert.equal(selected?.year, 2026);
  assert.equal(selected?.month, 2);
});

test("Previous published month crosses year boundary", () => {
  const previous = resolvePreviousPublishedMonth(new Date("2026-01-05T12:00:00.000Z"));
  assert.equal(previous.getFullYear(), 2025);
  assert.equal(previous.getMonth(), 11);
});

test("Conference Board target month helper aligns with previous published month", () => {
  const resolved = resolveConferenceBoardTargetMonth(new Date("2026-03-03T15:00:00.000Z"));
  assert.equal(resolved.getFullYear(), 2026);
  assert.equal(resolved.getMonth(), 1);
});
