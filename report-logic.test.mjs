/**
 * Report-logic regression tests.
 * Run: node tests/report-logic.test.mjs
 *
 * These mirror the pure logic embedded in components/RunwayApp.jsx (cash gap
 * analysis, protection snapshot) and scan the component for banned advice
 * language, so compliance wording can never silently regress. Keep the
 * mirrored functions in sync if the component logic changes.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) { pass++; } else { fail++; console.error("FAIL:", name); } };

/* ---------------- cash gap (mirror of the cashGap useMemo) ---------------- */
const cashGapCalc = (rows, showReal, inflDec) => {
  const defl = (v, y) => (showReal ? v / Math.pow(1 + inflDec, y) : v);
  const drawRows = rows.map((r) => ({ ...r, draw: defl(r.coveredBySavings || 0, r.y), short: defl(r.shortfall || 0, r.y) })).filter((r) => r.draw > 0 || r.short > 0);
  const totalDrawn = rows.reduce((s, r) => s + defl(r.coveredBySavings || 0, r.y), 0);
  const uncovered = rows.filter((r) => (r.shortfall || 0) > 0);
  const base = { uncoveredCount: uncovered.length, firstUncoveredYear: uncovered.length ? uncovered[0].year : null, totalDrawn };
  if (!drawRows.length) return { ...base, none: true, oneOffOnly: false };
  let peak = drawRows[0]; drawRows.forEach((r) => { if (r.draw > peak.draw) peak = r; });
  const sustained = drawRows.find((r, i) => drawRows[i + 1] && drawRows[i + 1].year === r.year + 1);
  if (!sustained) return { ...base, none: false, oneOffOnly: true, isolatedYears: drawRows.map((r) => r.year), peakDraw: peak.draw, peakYear: peak.year };
  const first = sustained;
  const next5 = rows.filter((r) => r.year >= first.year && r.year < first.year + 5);
  const avgDraw = next5.length ? next5.reduce((s, r) => s + defl(r.coveredBySavings || 0, r.y), 0) / next5.length : first.draw;
  return { ...base, none: false, oneOffOnly: false, firstYear: first.year, firstAge: first.c1Age, avgDraw, peakDraw: peak.draw, peakYear: peak.year };
};

// Fixture A: surplus, one one-off (2030), sustained drawdown from 2038, shortfalls from 2044
const rowsA = [];
for (let y = 0; y < 20; y++) {
  const year = 2026 + y;
  rowsA.push({ y, year, c1Age: 49 + y, coveredBySavings: (year === 2030 ? 30000 : 0) + (year >= 2038 ? 40000 : 0), shortfall: year >= 2044 ? 5000 : 0 });
}
const gA = cashGapCalc(rowsA, false, 0.025);
t("A sustained start skips one-off", gA.firstYear === 2038 && !gA.oneOffOnly && !gA.none);
t("A uncovered years", gA.uncoveredCount === 2 && gA.firstUncoveredYear === 2044);

// Fixture B: isolated one-offs only (no consecutive pair)
const rowsB = [];
for (let y = 0; y < 10; y++) rowsB.push({ y, year: 2026 + y, c1Age: 49 + y, coveredBySavings: [2028, 2031].includes(2026 + y) ? 20000 : 0, shortfall: 0 });
const gB = cashGapCalc(rowsB, false, 0.025);
t("B one-off-only mode", gB.oneOffOnly === true && gB.isolatedYears.join(",") === "2028,2031");
t("B not none", gB.none === false);

// Fixture C: never drawn
const gC = cashGapCalc([{ y: 0, year: 2026, c1Age: 49, coveredBySavings: 0, shortfall: 0 }], true, 0.025);
t("C none", gC.none === true && gC.oneOffOnly === false);

// Real-terms deflation reduces figures
const gA_real = cashGapCalc(rowsA, true, 0.025);
t("A real < nominal", gA_real.peakDraw < gA.peakDraw);

/* ------------- protection snapshot (mirror of the protSnap useMemo) ------------- */
const protSnapCalc = (protection, couple, firstDeathYear, rows, lifeC1, lifeC2) => {
  const per = {};
  ["client1", "client2"].forEach((k) => {
    const pols = protection.filter((p) => p.insured === k);
    if (!pols.length) return;
    per[k] = { total: pols.reduce((s, p) => s + (+p.sumAssured || 0), 0), prem: pols.reduce((s, p) => s + (+p.premium || 0), 0), count: pols.length };
  });
  let firstDeath = null;
  if (couple && firstDeathYear) {
    const dr = rows.find((r) => r.year === firstDeathYear);
    const who = dr && !dr.aliveC1 ? "client1" : "client2";
    const age = who === "client1" ? lifeC1 : lifeC2;
    const paying = protection.filter((p) => p.insured === who && (+p.coverToAge || 0) >= age);
    firstDeath = { who, year: firstDeathYear, payout: paying.reduce((s, p) => s + (+p.sumAssured || 0), 0) };
  }
  return { per, firstDeath };
};
const prot = [
  { insured: "client1", sumAssured: 400000, premium: 80, coverToAge: 75 },
  { insured: "client1", sumAssured: 200000, premium: 40, coverToAge: 95 },
  { insured: "client2", sumAssured: 300000, premium: 50, coverToAge: 90 },
];
const ps = protSnapCalc(prot, true, 2061, [{ year: 2061, aliveC1: false, aliveC2: true }], 84, 89);
t("PS totals", ps.per.client1.total === 600000 && ps.per.client2.total === 300000);
t("PS only in-term policy pays", ps.firstDeath.payout === 200000);

/* ---------------- compliance language scan ---------------- */
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "components", "RunwayApp.jsx"), "utf8");
const banned = [/you should/i, /we recommend/i, /consider buying/i, /you ought/i, /must buy/i, /advise you to/i];
banned.forEach((re) => t(`no banned phrase ${re}`, !re.test(src)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
