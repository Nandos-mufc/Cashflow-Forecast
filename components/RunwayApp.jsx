"use client";
import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  User,
  Users,
  Landmark,
  TrendingUp,
  Receipt,
  SlidersHorizontal,
  Layers,
  FileText,
  Plus,
  Trash2,
  Maximize2,
  Minimize2,
  Sun,
  Moon,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  Target,
  HelpCircle,
  Globe,
  CreditCard,
  Shield,
  StickyNote,
  Home,
  Activity,
  PiggyBank,
} from "lucide-react";

/* ================================================================== */
/*  MODEL                                                              */
/* ================================================================== */
const uid = () => Math.random().toString(36).slice(2, 9);
const aKey = (id) => "a_" + id;
const iKey = (id) => "i_" + id;

const ASSET_TYPES = [
  { value: "cash", label: "Cash" },
  { value: "investment", label: "Investment" },
  { value: "pension", label: "Pension" },
  { value: "property", label: "Property" },
];
/* Risk profile templates — growth rate (% p.a., before inflation) per asset type.
   Picking a profile applies these rates to the assets owned by that person. */
const RISK_PROFILES = [
  { id: "cautious",   label: "Cautious",   rates: { cash: 1.0, investment: 3.0, pension: 3.0, property: 2.0 } },
  { id: "balanced",   label: "Balanced",   rates: { cash: 1.5, investment: 5.0, pension: 5.0, property: 3.0 } },
  { id: "growth",     label: "Growth",     rates: { cash: 1.5, investment: 6.5, pension: 6.5, property: 3.5 } },
  { id: "aggressive", label: "Aggressive", rates: { cash: 2.0, investment: 8.0, pension: 8.0, property: 4.0 } },
];
const riskProfileById = (id) => RISK_PROFILES.find((p) => p.id === id) || null;
const LIAB_TYPES = [
  { value: "mortgage", label: "Residential mortgage" },
  { value: "btl", label: "BTL mortgage" },
  { value: "loan", label: "Loan" },
  { value: "card", label: "Credit card" },
  { value: "other", label: "Other" },
];
const FREQS = [
  { value: "oneoff", label: "One-off" },
  { value: "weekly", label: "Per week" },
  { value: "monthly", label: "Per month" },
  { value: "annual", label: "Per year" },
  { value: "everyN", label: "Every N years" },
];
const CONTRIB_FREQS = FREQS.filter((f) => ["oneoff", "monthly", "annual"].includes(f.value));
const ESCS = [
  { value: "none", label: "No increase" },
  { value: "inflation", label: "With inflation" },
  { value: "custom", label: "Custom %" },
];
const ANCHORS = [
  { value: "now", label: "Now" },
  { value: "retirement", label: "Retirement" },
  { value: "end", label: "End of plan" },
  { value: "age", label: "Age…" },
];
const PRIORITIES = [
  { value: "essential", label: "Essential" },
  { value: "discretionary", label: "Discretionary" },
];
const DEATH_MODES = [
  { value: "cease", label: "Ceases" },
  { value: "continue", label: "Continues to survivor" },
];
const TAXTREAT = [
  { value: "net", label: "Net / take-home" },
  { value: "gross", label: "Gross / taxable" },
];
const CURRENCIES = {
  GBP: { code: "GBP", symbol: "£" },
  USD: { code: "USD", symbol: "$" },
  AED: { code: "AED", symbol: "AED" },
  EUR: { code: "EUR", symbol: "€" },
};

const contribDefault = (enabled = false, amount = 0) => ({
  enabled, amount, frequency: "annual", source: "personal", escalation: "inflation", customEsc: 0,
  start: { mode: "now" }, end: { mode: "retirement" },
});
const withdrawalDefault = () => ({ enabled: false, amount: 0, frequency: "annual", escalation: "inflation", customEsc: 0, start: { mode: "retirement" }, end: { mode: "end" } });
const deathDefault = () => ({ mode: "cease", pct: 50 });

// Tax is OFF by default (international-first). When off, the engine behaves exactly as if this block didn't exist.
const taxDefault = () => ({
  enabled: false,
  cgtRate: 0,
  periods: [{ id: uid(), label: "Tax-free", startMode: "now", startAge: 0, personalAllowance: 0, bands: [], cgtRate: 0 }],
  estate: { enabled: false, nrb: 0, rnrb: 0, rate: 40, transferableNrb: true, taperThreshold: 2000000 },
});
// Estate / succession tax — deliberately simplified for illustration. Flat allowance + single rate
// above it, no lifetime-gift history, no business/agricultural relief. The UK residence nil-rate
// band taper IS modelled when a taper threshold is set (the UK preset sets £2,000,000).
// Couples: models the SECOND death only (spouse transfers are typically exempt), with an optional
// transferable allowance so the survivor's estate carries both nil-rate bands.
function computeEstate(grossEstate, est, isCouple) {
  const gross = Math.max(0, Number(grossEstate) || 0);
  if (!est || !est.enabled) return { gross, allowance: 0, taxable: 0, tax: 0, net: gross, applied: false, rnrbTapered: 0 };
  const mult = isCouple && est.transferableNrb !== false ? 2 : 1;
  const nrb = (Number(est.nrb) || 0) * mult;       // standard nil-rate band — never tapered
  let rnrb = (Number(est.rnrb) || 0) * mult;       // residence nil-rate band — tapered on large estates
  // Residence nil-rate band taper: lose £1 of RNRB for every £2 the estate exceeds the threshold
  // (UK: £2,000,000, tested against the second-death estate). Only applies when a threshold is set.
  const taperThreshold = Number(est.taperThreshold) || 0;
  let rnrbTapered = 0;
  if (taperThreshold > 0 && rnrb > 0 && gross > taperThreshold) {
    rnrbTapered = Math.min(rnrb, (gross - taperThreshold) / 2);
    rnrb -= rnrbTapered;
  }
  const allowance = nrb + rnrb;
  const rate = Math.min(100, Math.max(0, Number(est.rate) || 0)) / 100;
  const taxable = Math.max(0, gross - allowance);
  const tax = taxable * rate;
  return { gross, allowance, taxable, tax, net: gross - tax, applied: true, rnrbTapered };
}
// Starting points only — the adviser verifies and edits the current rates. Not a maintained library.
const TAX_PRESETS = {
  none: { personalAllowance: 0, bands: [], cgtRate: 0 },
  uk: { personalAllowance: 12570, bands: [{ upTo: 50270, rate: 20 }, { upTo: 125140, rate: 40 }, { upTo: "", rate: 45 }], cgtRate: 24 },
  blank: { personalAllowance: 0, bands: [{ upTo: "", rate: 0 }], cgtRate: 0 },
};
/* ---- Stress testing ---------------------------------------------------------------------------
   Two families of scenario:
   • Historical — illustrative annual-return sequences that capture the SHAPE of a real market
     episode (a crash and its recovery), applied as ABSOLUTE returns for those years. Each has a
     UK lens (broad UK equity) and a Global lens (broad global equity in the client's currency),
     because a sterling-based and a globally-diversified investor lived very different versions of
     the same crisis — a genuinely useful point to show an international client.
   • Stylised — simple, fully explainable assumptions ("4 points below assumption for ten years"),
     applied as a DELTA to the assumed growth rate.
   Plus a Custom builder where the adviser types their own sequence.
   Figures are rounded illustrations of each episode's shape, not point-accurate index data, and are
   labelled as such in the report. They are not predictions. */

// Absolute annual total returns (%), by market lens. Length = number of shocked years.
const MARKET_HISTORY = {
  gfc:     { uk: [-30, 30, 14, -3, 12], global: [-18, 16, 16, -6, 11] },   // 2008 crisis + recovery
  dotcom:  { uk: [-6, -13, -22, 21, 13], global: [-9, -16, -27, 24, 14] }, // 2000–2003 tech unwind
  covid:   { uk: [-30, 28], global: [-34, 35] },                           // 2020 pandemic V-shape
  black87: { uk: [-28, 22], global: [-26, 20] },                           // 1987 sudden crash + bounce
};

const AFFECTS = { growth: ["investment", "pension"], all: null }; // null = every asset type

const STRESS_SCENARIOS = [
  { id: "gfc",     group: "historical", label: "2008 financial crisis", short: "A 2008-style crash, then a multi-year recovery.", lensable: true, timingable: true, mode: "absolute", build: (start, end, lens) => seqShocks(MARKET_HISTORY.gfc, lens, start) },
  { id: "dotcom",  group: "historical", label: "Dot-com crash (2000–03)", short: "Three falling years as the tech bubble unwinds, then recovery.", lensable: true, timingable: true, mode: "absolute", build: (start, end, lens) => seqShocks(MARKET_HISTORY.dotcom, lens, start) },
  { id: "covid",   group: "historical", label: "2020 pandemic shock", short: "A sudden ~30% fall and rapid V-shaped recovery.", lensable: true, timingable: true, mode: "absolute", build: (start, end, lens) => seqShocks(MARKET_HISTORY.covid, lens, start) },
  { id: "black87", group: "historical", label: "1987 'Black Monday'", short: "A sharp single-shock crash that recovers within two years.", lensable: true, timingable: true, mode: "absolute", build: (start, end, lens) => seqShocks(MARKET_HISTORY.black87, lens, start) },
  { id: "lostDecade", group: "stylised", label: "Lost decade", short: "Returns 4 points below your assumption for ten years, then back to normal.", lensable: false, timingable: true, mode: "delta", build: (start) => { const o = {}; for (let i = 0; i < 10; i++) o[start + i] = -4; return o; } },
  { id: "lowReturns", group: "stylised", label: "Permanently lower returns", short: "Returns 2 points below your assumption for the whole plan.", lensable: false, timingable: false, mode: "delta", build: (start, end) => { const o = {}; for (let i = 0; i <= end; i++) o[i] = -2; return o; } },
  { id: "custom",  group: "custom", label: "Custom sequence", short: "Enter your own run of annual returns.", lensable: false, timingable: true, mode: "absolute", build: null },
];
// Map a return sequence onto plan-year offsets starting at `start`.
function seqShocks(hist, lens, start) {
  const seq = (hist && hist[lens]) || (hist && hist.uk) || [];
  const o = {};
  seq.forEach((v, i) => { o[start + i] = v; });
  return o;
}
const stressById = (id) => STRESS_SCENARIOS.find((s) => s.id === id) || null;

/* ---- Monte Carlo ------------------------------------------------------------------------------
   Runs the full projection many times, each with a different random sequence of market returns drawn
   around the SAME assumed growth. Counts how many runs keep the plan funded → a probability of success.
   • Seeded RNG (mulberry32) + Box–Muller for a fixed, reproducible result on a given plan — re-running
     the same inputs always gives the same figure, which matters for a documented suitability report.
   • One standardised market move per year is shared across assets and scaled by each asset type's
     volatility, so risky assets fall together in a bad year (a deliberately conservative, single-factor
     model) while cash barely moves.
   • Volatility is derived from each asset's assumed growth (higher expected return ⇒ higher volatility),
     so a cautious plan isn't punished with aggressive-portfolio swings. One Lower/Typical/Higher knob
     scales it. Returns are modelled as normal — real markets have fatter tails, so this is best read as
     a resilience indicator, not a precise probability (stated plainly in the report). */
const MC_SEED = 0x9e3779b9; // fixed → reproducible
const MC_RUNS = 500;
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function makeNormal(rng) { let spare = null; return () => { if (spare !== null) { const s = spare; spare = null; return s; } let u, v, s; do { u = rng() * 2 - 1; v = rng() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0); const m = Math.sqrt((-2 * Math.log(s)) / s); spare = v * m; return u * m; }; }
const MC_LEVELS = [
  { id: "lower", label: "Lower", mult: 0.7 },
  { id: "typical", label: "Typical", mult: 1.0 },
  { id: "higher", label: "Higher", mult: 1.4 },
];
// Annual volatility (% points) per asset type, derived from the assumed growth of the assets of that type.
function volByTypeFor(assets, levelMult) {
  const K = { cash: 0.4, investment: 2.0, pension: 2.0, property: 1.4 };
  const FLOOR = { cash: 0.5, investment: 6, pension: 6, property: 3 };
  const CEIL = { cash: 2, investment: 22, pension: 22, property: 12 };
  const out = {};
  ["cash", "investment", "pension", "property"].forEach((t) => {
    const rates = assets.filter((a) => a.type === t).map((a) => Number(a.growthRate) || 0);
    const g = rates.length ? rates.reduce((s, x) => s + x, 0) / rates.length : 0;
    // Floor/ceiling define the realistic volatility band at the CENTRAL (Typical) assumption; the
    // Lower/Typical/Higher knob then scales that band. The floor is applied BEFORE the knob, not
    // after — otherwise, for a low-growth asset, the growth-derived volatility sits under the floor
    // at every knob setting, the floor clamps all three to the same value, and the knob silently
    // does nothing (e.g. an investment modelled at ~2% growth pinned to 6% at Lower/Typical/Higher
    // alike). Scaling the floored central value keeps Typical at the prudent minimum while letting
    // the knob move. Where the floor/ceiling aren't binding at Typical this is identical to before.
    const central = Math.max(FLOOR[t], Math.min(CEIL[t], g * (K[t] || 1.5)));
    out[t] = central * levelMult;
  });
  return out;
}
const NOTE_COLORS = ["#8b5cf6", "#0ea5e9", "#f59e0b", "#ec4899", "#14b8a6", "#6366f1"];
const noteColor = (i) => NOTE_COLORS[i % NOTE_COLORS.length];

const SEED = {
  profile: {
    couple: true,
    currency: "GBP",
    client1: { name: "Adam Reyes", dob: "1977-04-12", retirementAge: 60, lifeExpectancy: 93 },
    client2: { name: "Sara Reyes", dob: "1980-09-20", retirementAge: 60, lifeExpectancy: 95 },
  },
  assumptions: { inflation: 2.5, survivorExpenseFactor: 67, liquidationOrder: ["cash", "investment", "pension", "property"], tax: taxDefault() },
  assets: [
    { id: uid(), name: "Cash reserve", type: "cash", value: 150000, growthRate: 1.5, drawdown: true, owner: "joint", contribution: contribDefault() },
    { id: uid(), name: "Offshore Bond", type: "investment", value: 450000, growthRate: 5, drawdown: true, owner: "joint", offshoreBond: true, contribution: contribDefault() },
    { id: uid(), name: "Pension / QROPS", type: "pension", value: 600000, growthRate: 5, drawdown: true, owner: "client1", contribution: contribDefault(true, 30000) },
    { id: uid(), name: "SIPP", type: "pension", value: 250000, growthRate: 5, drawdown: true, owner: "client2", contribution: contribDefault(true, 12000) },
    { id: uid(), name: "BTL Property", type: "property", value: 400000, growthRate: 3, drawdown: false, owner: "joint", contribution: contribDefault() },
  ],
  liabilities: [
    { id: uid(), name: "BTL mortgage", type: "mortgage", balance: 200000, rate: 5, monthlyPayment: 1300, owner: "joint" },
  ],
  protection: [
    { id: uid(), name: "Adam life cover", insured: "client1", sumAssured: 400000, premium: 180, coverToAge: 120 },
  ],
  incomes: [
    { id: uid(), name: "Salary — Adam", amount: 165000, frequency: "annual", escalation: "custom", customEsc: 3, everyYears: 1, start: { mode: "now" }, end: { mode: "retirement" }, owner: "client1", onDeath: deathDefault() },
    { id: uid(), name: "Salary — Sara", amount: 90000, frequency: "annual", escalation: "custom", customEsc: 3, everyYears: 1, start: { mode: "now" }, end: { mode: "retirement" }, owner: "client2", onDeath: deathDefault() },
    { id: uid(), name: "Rental income", amount: 2000, frequency: "monthly", escalation: "inflation", customEsc: 0, everyYears: 1, start: { mode: "now" }, end: { mode: "end" }, owner: "joint", onDeath: deathDefault() },
    { id: uid(), name: "State pension — Adam", amount: 11500, frequency: "annual", escalation: "inflation", customEsc: 0, everyYears: 1, start: { mode: "age", age: 67 }, end: { mode: "end" }, owner: "client1", onDeath: deathDefault() },
    { id: uid(), name: "State pension — Sara", amount: 11500, frequency: "annual", escalation: "inflation", customEsc: 0, everyYears: 1, start: { mode: "age", age: 67 }, end: { mode: "end" }, owner: "client2", onDeath: deathDefault() },
  ],
  expenses: [
    { id: uid(), name: "Essential living", amount: 105000, frequency: "annual", escalation: "inflation", customEsc: 0, everyYears: 1, start: { mode: "now" }, end: { mode: "end" }, priority: "essential", owner: "joint" },
    { id: uid(), name: "Lifestyle & travel", amount: 55000, frequency: "annual", escalation: "inflation", customEsc: 0, everyYears: 1, start: { mode: "now" }, end: { mode: "age", age: 80 }, priority: "discretionary", owner: "joint" },
    { id: uid(), name: "School fees", amount: 35000, frequency: "annual", escalation: "inflation", customEsc: 0, everyYears: 1, start: { mode: "now" }, end: { mode: "age", age: 55 }, priority: "essential", owner: "joint" },
    { id: uid(), name: "Car replacement", amount: 45000, frequency: "everyN", escalation: "inflation", customEsc: 0, everyYears: 7, start: { mode: "age", age: 55 }, end: { mode: "end" }, priority: "discretionary", owner: "joint" },
  ],
};

/* ================================================================== */
/*  ENGINE                                                            */
/* ================================================================== */
function deriveAge(dob) {
  const d = new Date(dob);
  if (isNaN(d.getTime())) return 0;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return Math.max(0, a);
}
// fraction of the current age-year still remaining (days to next birthday / 365)
function firstYearFraction(dob) {
  const d = new Date(dob);
  if (isNaN(d.getTime())) return 1;
  const now = new Date();
  let next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (next <= now) next = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
  const days = Math.round((next - now) / 86400000);
  return Math.min(1, Math.max(0.01, days / 365));
}
function planEndYears(profile) {
  const a1 = deriveAge(profile.client1.dob);
  const e1 = (Number(profile.client1.lifeExpectancy) || 95) - a1;
  if (!profile.couple) return Math.max(1, Math.min(80, e1));
  const a2 = deriveAge(profile.client2.dob);
  const e2 = (Number(profile.client2.lifeExpectancy) || 95) - a2;
  return Math.max(1, Math.min(80, Math.max(e1, e2)));
}
function makeCtx(profile, assumptions) {
  return {
    couple: profile.couple,
    age0c1: deriveAge(profile.client1.dob),
    age0c2: deriveAge(profile.client2.dob),
    retC1: Number(profile.client1.retirementAge) || 0,
    retC2: Number(profile.client2.retirementAge) || 0,
    lifeC1: Number(profile.client1.lifeExpectancy) || 95,
    lifeC2: Number(profile.client2.lifeExpectancy) || 95,
    planEndYear: planEndYears(profile),
    tax: assumptions.tax || { enabled: false, cgtRate: 0, periods: [] },
  };
}
const escRate = (item, inflDec) =>
  item.escalation === "inflation" ? inflDec : item.escalation === "custom" ? (Number(item.customEsc) || 0) / 100 : 0;

// resolve an anchor to a YEAR offset (0 = now), owner-aware
function resolveYear(anc, owner, ctx) {
  if (!anc || anc.mode === "now") return 0;
  const isC2 = owner === "client2";
  const age0 = isC2 ? ctx.age0c2 : ctx.age0c1;
  const ret = isC2 ? ctx.retC2 : ctx.retC1;
  if (anc.mode === "retirement") return ret - age0;
  if (anc.mode === "end") return ctx.planEndYear;
  return (Number(anc.age) || age0) - age0;
}
// resolve an anchor to an AGE for editor display
function resolveAge(anc, owner, ctx) {
  const isC2 = owner === "client2";
  const age0 = isC2 ? ctx.age0c2 : ctx.age0c1;
  if (!anc || anc.mode === "now") return age0;
  if (anc.mode === "retirement") return isC2 ? ctx.retC2 : ctx.retC1;
  if (anc.mode === "end") return ctx.age0c1 + ctx.planEndYear;
  return Number(anc.age) || age0;
}
function flowForYear(item, y, ctx, inflDec) {
  const owner = item.owner || "client1";
  const sY = resolveYear(item.start, owner, ctx);
  const esc = Math.pow(1 + escRate(item, inflDec), y);
  const amt = Number(item.amount) || 0;
  if (item.frequency === "oneoff") return y === sY ? amt * esc : 0;
  const eY = resolveYear(item.end, owner, ctx);
  if (eY < sY || y < sY || y > eY) return 0;
  if (item.frequency === "everyN") {
    const n = Math.max(1, Number(item.everyYears) || 1);
    return (y - sY) % n === 0 ? amt * esc : 0;
  }
  const mult = item.frequency === "weekly" ? 52 : item.frequency === "monthly" ? 12 : 1;
  return amt * mult * esc;
}

// ── Tax helpers ───────────────────────────────────────────────────────────
// Returns the active jurisdiction period for a given (Client 1) age, or null if tax is off.
function taxPeriodFor(c1Age, tax) {
  if (!tax || !tax.enabled || !tax.periods || !tax.periods.length) return null;
  let active = tax.periods[0], bestStart = -Infinity;
  for (const p of tax.periods) {
    const sa = p.startMode === "now" ? -Infinity : (Number(p.startAge) || 0);
    if (c1Age >= sa && sa >= bestStart) { active = p; bestStart = sa; }
  }
  return active;
}
const bandUpper = (b) => (b.upTo == null || b.upTo === "" ? Infinity : Number(b.upTo));
function incomeTaxOf(income, period) {
  if (!period || !period.bands || !period.bands.length) return 0;
  const pa = Number(period.personalAllowance) || 0;
  const sorted = [...period.bands].sort((a, b) => bandUpper(a) - bandUpper(b)); // tolerate unsorted entry
  let tax = 0, lower = pa;
  for (const b of sorted) {
    const upper = bandUpper(b);
    if (income > lower) { const amt = Math.min(income, upper) - lower; if (amt > 0) tax += (amt * (Number(b.rate) || 0)) / 100; }
    lower = upper;
    if (income <= upper) break;
  }
  return tax;
}
// Gross withdrawal needed to net `need` of income, given `prior` taxable income already used this year.
// Solves against the full progressive band table (handles spanning the allowance and multiple bands).
function grossUpIncome(need, prior, period) {
  if (need <= 0) return 0;
  if (!period || !period.bands || !period.bands.length) return need;
  const baseTax = incomeTaxOf(prior, period);
  const netOf = (g) => g - (incomeTaxOf(prior + g, period) - baseTax);
  let lo = need, hi = need * 2 + 1000;
  for (let i = 0; i < 60 && netOf(hi) < need; i++) hi *= 1.6;
  if (netOf(hi) < need) return hi; // pathological band table (≥100% marginal) — give up gracefully
  for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (netOf(m) >= need) hi = m; else lo = m; }
  return hi;
}

function projectCashflow({ profile, assumptions, assets, incomes, expenses, liabilities = [], protection = [], lumpSums = [], incomeStop = null, shocks, shockTypes = null, shockMode = "delta", marketPath = null, volByType = null, autoInvestSurplus = true }) {
  const ctx = makeCtx(profile, assumptions);
  const couple = ctx.couple;
  const inflDec = (Number(assumptions.inflation) || 0) / 100;
  const spendingPattern = assumptions.spendingPattern || null; // dynamic "retirement smile" — read from assumptions so every call site honours it
  const sf = Number(assumptions.survivorExpenseFactor);
  const survFactor = (couple && !isNaN(sf) ? sf : 100) / 100;
  const baseYear = new Date().getFullYear();
  const firstFrac = firstYearFraction(profile.client1.dob);

  const bal = {};
  const premium = {};
  const bondWithdrawn = {};
  assets.forEach((a) => {
    bal[a.id] = Math.max(0, Number(a.value) || 0);
    premium[a.id] = bal[a.id];
    bondWithdrawn[a.id] = 0;
  });
  const liab = {};
  liabilities.forEach((L) => (liab[L.id] = Math.max(0, Number(L.balance) || 0)));

  // Growth preference for where surplus accumulates. Default 'cash' preserves prior behaviour
  // (cash-first, else investment). 'invest' flips the ordering so surplus compounds at the
  // investment rate. An explicit surplusDestId still overrides this entirely.
  const surGrow = assumptions.surplusGrowth === "invest" ? "investment" : "cash";
  const surOther = surGrow === "cash" ? "investment" : "cash";
  const surplusDest = () => {
    const chosen = assumptions.surplusDestId && assets.find((a) => a.id === assumptions.surplusDestId && (a.type === "cash" || a.type === "investment"));
    if (chosen) return chosen.id;
    return (assets.find((a) => a.type === surGrow) || assets.find((a) => a.type === surOther) || assets[0] || {}).id;
  };
  // Where a given person's surplus accumulates: their own cash/investment first, then a joint pot, then the global default.
  // This keeps each partner's saved surplus attributed to them, which matters on death (the pot transfers by its owner's rules).
  const ownerDest = (o) => {
    const own = (t) => assets.find((a) => a.type === t && (a.owner || "client1") === o);
    const jnt = (t) => assets.find((a) => a.type === t && (a.owner || "client1") === "joint");
    const a = own(surGrow) || own(surOther) || jnt(surGrow) || jnt(surOther);
    return a ? a.id : surplusDest();
  };
  const bucketOf = (o) => (o === "client2" ? "client2" : o === "joint" ? "joint" : "client1");

  // Adviser-controlled liquidation order — the order pots are drained to cover a shortfall.
  // Defaults to cash → investment → pension → property; the adviser can reorder (e.g. pension last
  // for estate reasons). Any types missing from a saved order are appended so all are always covered.
  const DRAW_TYPES = ["cash", "investment", "pension", "property"];
  const liqOrder = (() => {
    const saved = Array.isArray(assumptions.liquidationOrder) ? assumptions.liquidationOrder.filter((t) => DRAW_TYPES.includes(t)) : [];
    DRAW_TYPES.forEach((t) => { if (!saved.includes(t)) saved.push(t); });
    return saved;
  })();

  const rows = [];
  let prevAliveC1 = true, prevAliveC2 = true;
  for (let y = 0; y <= ctx.planEndYear; y++) {
    const c1Age = ctx.age0c1 + y;
    const c2Age = ctx.age0c2 + y;
    const aliveC1 = c1Age <= ctx.lifeC1;
    const aliveC2 = couple ? c2Age <= ctx.lifeC2 : false;
    const ownerAlive = (o) => (o === "client2" ? aliveC2 : o === "joint" ? aliveC1 || aliveC2 : aliveC1);
    const firstDeath = couple && (!aliveC1 || !aliveC2); // exactly one gone; plan only runs while someone alive
    const justDiedC1 = prevAliveC1 && !aliveC1;
    const justDiedC2 = couple && prevAliveC2 && !aliveC2;
    const frac = y === 0 ? firstFrac : 1; // partial current year

    // snapshot at the START of this age-year — this is what the chart shows at this age
    const pots = {};
    let total = 0;
    let property = 0;
    assets.forEach((a) => {
      const v = Math.max(0, bal[a.id]);
      pots[aKey(a.id)] = v;
      total += v;
      if (a.type === "property") property += v;
    });
    const debt = liabilities.reduce((s, L) => s + (liab[L.id] || 0), 0); // start-of-year outstanding debt

    // income for this year (pro-rated; death rules)
    let income = 0;
    const incomeBy = {};
    const incByOwner = { client1: 0, client2: 0, joint: 0 };
    incomes.forEach((i) => {
      let v = flowForYear(i, y, ctx, inflDec) * frac;
      const o = i.owner || "client1";
      if (couple && (o === "client1" || o === "client2") && !ownerAlive(o)) {
        v = i.onDeath && i.onDeath.mode === "continue" ? v * ((Number(i.onDeath.pct) || 0) / 100) : 0;
      }
      // CI claim: the affected person can no longer earn — stop their salary-like income (ends at retirement) from the claim year
      if (incomeStop && o === incomeStop.owner && y >= incomeStop.year && i.end && i.end.mode === "retirement") v = 0;
      incomeBy[i.id] = v;
      incByOwner[bucketOf(o)] += v;
      income += v;
    });

    // Gross / taxable income (e.g. a UK salary, or state/rental income after a move to the UK) is taxed
    // in any residence period that has income-tax bands. Net-entered income is take-home and untouched —
    // so existing plans (every income defaults to net) behave exactly as before. The taxed income also
    // forms the base that later pension-pot withdrawals stack on, so the draw is taxed at the right
    // marginal rate rather than starting from the personal allowance again.
    const incPeriod = taxPeriodFor(c1Age, ctx.tax);
    let grossTaxableIncome = 0;
    incomes.forEach((i) => { if ((i.taxTreatment || "net") === "gross") grossTaxableIncome += incomeBy[i.id] || 0; });
    const incomeTaxDue = incPeriod && grossTaxableIncome > 0 ? incomeTaxOf(grossTaxableIncome, incPeriod) : 0;
    if (incomeTaxDue > 0) {
      // Apportion the tax back across the gross streams so the money-in breakdown shows take-home by source.
      incomes.forEach((i) => {
        if ((i.taxTreatment || "net") !== "gross") return;
        const cut = incomeTaxDue * ((incomeBy[i.id] || 0) / grossTaxableIncome);
        incomeBy[i.id] = (incomeBy[i.id] || 0) - cut;
      });
      income -= incomeTaxDue;
    }

    // expenditure for this year (pro-rated; death rules + survivor factor on joint)
    let expenditure = 0, expEssential = 0, expDiscretionary = 0, liabRepay = 0, premiums = 0;
    const expByOwner = { client1: 0, client2: 0, joint: 0 };
    // Dynamic spending pattern (the "retirement smile"): discretionary spending eases in later life.
    // Keyed to the primary client's age. Essentials are never scaled. 1.0 = no change.
    const spendMult = (!spendingPattern || spendingPattern.mode !== "smile") ? 1
      : c1Age >= (Number(spendingPattern.noGoAge) || 85) ? (Number(spendingPattern.noGoMult) || 100) / 100
      : c1Age >= (Number(spendingPattern.slowGoAge) || 75) ? (Number(spendingPattern.slowGoMult) || 100) / 100
      : 1;
    expenses.forEach((e) => {
      let v = flowForYear(e, y, ctx, inflDec) * frac;
      const o = e.owner || "joint";
      if (couple && (o === "client1" || o === "client2") && !ownerAlive(o)) v = 0;
      else if (couple && o === "joint" && firstDeath) v *= survFactor;
      if (e.priority === "discretionary" && spendMult !== 1) v *= spendMult; // spending smile applies to lifestyle only
      expenditure += v;
      expByOwner[bucketOf(o)] += v;
      if (e.priority === "discretionary") expDiscretionary += v; else expEssential += v;
    });

    // liability repayments are cashflow out (full amount — debt doesn't shrink on death), then amortize the balance
    liabilities.forEach((L) => {
      const b0 = liab[L.id];
      if (b0 > 0) {
        const grown = b0 * Math.pow(1 + (Number(L.rate) || 0) / 100, frac);
        const sched = (Number(L.monthlyPayment) || 0) * 12 * frac;
        const pay = Math.min(sched, grown);
        liab[L.id] = Math.max(0, grown - pay);
        expenditure += pay;
        liabRepay += pay;
      }
    });

    // protection premiums are a cost while cover is in force
    protection.forEach((p) => {
      const o = p.insured || "client1";
      const insAge = o === "client2" ? c2Age : c1Age;
      const insAlive = o === "client2" ? aliveC2 : aliveC1;
      const inCover = insAlive && (!p.coverToAge || insAge <= Number(p.coverToAge));
      if (inCover) { const prem = (Number(p.premium) || 0) * 12 * frac; expenditure += prem; premiums += prem; }
    });

    // grow balances over the (partial) year.
    //  • Monte Carlo (marketPath set): a single standardised market move for the year (marketPath[y],
    //    in standard deviations) is scaled by each asset type's volatility and added to its assumed
    //    growth, so all risky assets move together in a good/bad year while cash barely moves. This is
    //    the highest-precedence path and is never combined with a deterministic stress.
    //  • Stress test (shocks set): a per-year shock to selected asset types only (shockTypes = null = all),
    //    in "delta" mode (added to assumed growth) or "absolute" mode (the asset earns the shock outright).
    // When none of these are set, this behaves exactly as the base plan.
    const shockPts = shocks && shocks[y] != null ? Number(shocks[y]) : null;
    const shockHits = (a) => shockPts != null && (!shockTypes || shockTypes.includes(a.type));
    const z = marketPath ? (Number(marketPath[y]) || 0) : null;
    assets.forEach((a) => {
      const base = Number(a.growthRate) || 0;
      let rate;
      if (z !== null) {
        rate = base + (volByType && volByType[a.type] != null ? Number(volByType[a.type]) : 0) * z;
      } else if (shockHits(a)) {
        if (shockMode === "absolute") {
          // In absolute (historical sequence) mode, only investment and pension assets receive the
          // equity return sequence. Cash and property earn their own assumed rate — applying an equity
          // crash-and-recovery sequence to a savings account or a house is not financially meaningful
          // and can counterintuitively improve outcomes during recovery years (cash "earning" +30%).
          if (a.type === "investment" || a.type === "pension") rate = shockPts;
          else rate = base;
        } else {
          rate = base + shockPts; // delta mode: shift relative to assumption for all targeted assets
        }
      } else {
        rate = base;
      }
      bal[a.id] = bal[a.id] * Math.pow(1 + rate / 100, frac);
    });

    // contributions (pro-rated; stop if owner has died)
    let contribPersonal = 0;
    const contribByOwner = { client1: 0, client2: 0, joint: 0 };
    assets.forEach((a) => {
      const c = a.contribution;
      // "contributor" is who funds the contribution (defaults to the asset's owner).
      // On a joint asset, each partner may fund a separate contribution — when one dies,
      // only their share should stop. This lets you model "Partner A contributes £65k,
      // Partner B contributes £20k to the same joint pot" with correct survivor behaviour.
      const contributor = c && c.contributor ? c.contributor : (a.owner || "client1");
      const aliveOwner = couple ? ownerAlive(contributor) : true;
      if (c && c.enabled && aliveOwner) {
        const amt = flowForYear(c, y, ctx, inflDec) * frac;
        if (amt > 0) {
          bal[a.id] += amt;
          const fromCashflow = (c.funding || "cashflow") === "cashflow" && !(c.source === "employer" && a.type === "pension");
          if (fromCashflow) { contribPersonal += amt; contribByOwner[bucketOf(contributor)] += amt; }
        }
      }
    });

    // life cover: pay the sum assured into the household pot in the year the insured dies (within cover term)
    protection.forEach((p) => {
      if ((p.ptype || "life") === "ci") return; // critical-illness cover pays on claim, not on death
      const o = p.insured || "client1";
      const died = o === "client2" ? justDiedC2 : justDiedC1;
      const insAge = o === "client2" ? c2Age : c1Age;
      const within = !p.coverToAge || insAge <= Number(p.coverToAge);
      if (died && within) {
        const dest = surplusDest();
        if (dest) bal[dest] += Number(p.sumAssured) || 0;
      }
    });

    // CI claim (and any other modelled lump sums) land in the household pot in the relevant year
    lumpSums.forEach((ls) => {
      if (Number(ls.year) === y) {
        const dest = surplusDest();
        if (dest) bal[dest] += Number(ls.amount) || 0;
      }
    });

    // Planned withdrawals — an explicit drawdown set on an asset. Paid out of the pot into the
    // client's hands and surfaced as income (a "Drawdown" band in the MIMO), NOT an expense, so it
    // can never be double-counted against the expenditure list. Capped at the available balance.
    // Pensions can only be drawn from the owner's retirement age (or if inherited by a survivor).
    let plannedDraw = 0;
    assets.forEach((a) => {
      const w = a.withdrawal;
      if (!w || !w.enabled) return;
      if (a.type === "pension") {
        const o = a.owner || "client1";
        const oAge = o === "client2" ? c2Age : c1Age;
        const oRet = o === "client2" ? ctx.retC2 : ctx.retC1;
        const inherited = couple && !ownerAlive(o);
        if (!(oAge >= oRet || inherited)) return;
      }
      const want = flowForYear(w, y, ctx, inflDec) * frac;
      if (want <= 0) return;
      const taken = Math.min(bal[a.id], want);
      bal[a.id] -= taken;
      plannedDraw += taken;
    });

    const net = income - expenditure;
    // Planned drawdown has already left the pot (bal reduced) and is cash in the client's hands.
    // It funds spending; any part not needed is treated as consumed and does NOT get reinvested
    // (reinvesting it would cycle the money pension→savings and leave net worth unchanged, which is wrong).
    // Only genuine income surplus is available to auto-invest.
    const incomeSurplus = net - contribPersonal;

    const drawList = () => {
      const out = [];
      liqOrder.forEach((type) => {
        assets.filter((a) => a.type === type && a.drawdown).forEach((a) => {
          if (type === "pension") {
            const o = a.owner || "client1";
            const oAge = o === "client2" ? c2Age : c1Age;
            const oRet = o === "client2" ? ctx.retC2 : ctx.retC1;
            const inherited = couple && !ownerAlive(o); // inherited pot is accessible
            if (!(oAge >= oRet || inherited)) return;
          }
          out.push(a);
        });
      });
      return out;
    };

    // Withdraw to net `need` from one asset, applying tax for the active period.
    // When period is null (tax off) every branch returns gross === net → identical to the old loop.
    const period = incPeriod;
    const cgt = period ? Math.min(0.99, Math.max(0, (Number(period.cgtRate != null ? period.cgtRate : ctx.tax.cgtRate) || 0) / 100)) : 0;
    const drawFrom = (a, need, taxableYr) => {
      const avail = bal[a.id];
      if (avail <= 0 || need <= 0) return { gross: 0, net: 0, taxable: 0 };
      if (!period || a.type === "cash" || a.type === "property") {
        const g = Math.min(avail, need);
        return { gross: g, net: g, taxable: 0 };
      }
      if (a.offshoreBond) {
        const cumAllow = Math.min(premium[a.id], 0.05 * premium[a.id] * (y + 1)); // 5%/yr, caps at 100%
        const headroom = Math.max(0, cumAllow - bondWithdrawn[a.id]);
        let gross = Math.min(avail, need, headroom), net = gross, taxable = 0; // tax-free portion
        const rem = need - net;
        if (rem > 0 && avail - gross > 0) {
          const want = grossUpIncome(rem, taxableYr, period);
          const g2 = Math.min(avail - gross, want);
          const n2 = g2 - (incomeTaxOf(taxableYr + g2, period) - incomeTaxOf(taxableYr, period));
          gross += g2; net += n2; taxable += g2;
        }
        return { gross, net, taxable };
      }
      if (a.type === "investment") {
        if (cgt <= 0) { const g = Math.min(avail, need); return { gross: g, net: g, taxable: 0 }; }
        const g = Math.min(avail, need / (1 - cgt));
        return { gross: g, net: g * (1 - cgt), taxable: 0 }; // CGT isn't income tax — doesn't fill income bands
      }
      if (a.type === "pension") {
        const want = grossUpIncome(need, taxableYr, period);
        const g = Math.min(avail, want);
        const net = g - (incomeTaxOf(taxableYr + g, period) - incomeTaxOf(taxableYr, period));
        return { gross: g, net, taxable: g };
      }
      const g = Math.min(avail, need);
      return { gross: g, net: g, taxable: 0 };
    };

    let shortfall = 0;
    let taxPaid = incomeTaxDue;
    if (incomeSurplus + plannedDraw >= 0) {
      // Spending is covered by income and/or the planned drawdown.
      // Reinvest only true income surplus; any planned drawdown beyond what spending needed is consumed.
      const reinvest = Math.max(0, incomeSurplus);
      if (autoInvestSurplus && reinvest > 0) {
        // Attribute the household surplus to whoever generated it, so it lands in that person's own pot.
        // Joint income/spend is split evenly between living partners. Weights only set the split — the
        // total reinvested is unchanged; only which owner's pot receives it changes.
        const explicit = assumptions.surplusDestId && assets.find((a) => a.id === assumptions.surplusDestId && (a.type === "cash" || a.type === "investment"));
        if (explicit) {
          bal[explicit.id] += reinvest; // adviser has chosen a specific destination — respect it
        } else if (couple) {
          const jShare = (b) => (aliveC1 && aliveC2 ? b / 2 : b); // if one has died, the survivor carries the joint flow
          const net1 = incByOwner.client1 + (aliveC1 ? jShare(incByOwner.joint) : 0) - expByOwner.client1 - (aliveC1 ? jShare(expByOwner.joint) : 0) - contribByOwner.client1 - jShare(contribByOwner.joint);
          const net2 = incByOwner.client2 + (aliveC2 ? jShare(incByOwner.joint) : 0) - expByOwner.client2 - (aliveC2 ? jShare(expByOwner.joint) : 0) - contribByOwner.client2 - jShare(contribByOwner.joint);
          const w1 = aliveC1 ? Math.max(0, net1) : 0, w2 = aliveC2 ? Math.max(0, net2) : 0;
          const tot = w1 + w2;
          if (tot > 0) {
            const d1 = ownerDest("client1"), d2 = ownerDest("client2");
            if (w1 > 0 && d1) bal[d1] += reinvest * (w1 / tot);
            if (w2 > 0 && d2) bal[d2] += reinvest * (w2 / tot);
          } else { const dest = surplusDest(); if (dest) bal[dest] += reinvest; }
        } else {
          const dest = ownerDest("client1") || surplusDest(); if (dest) bal[dest] += reinvest;
        }
      }
    } else {
      // Even after the planned drawdown, spending isn't fully covered — auto-draw the remainder.
      let need = -(incomeSurplus + plannedDraw);
      let taxableYr = grossTaxableIncome;
      for (const a of drawList()) {
        if (need <= 0) break;
        const r = drawFrom(a, need, taxableYr);
        bal[a.id] -= r.gross;
        need -= r.net;
        taxableYr += r.taxable;
        taxPaid += r.gross - r.net;
        if (a.offshoreBond) bondWithdrawn[a.id] += r.gross;
      }
      shortfall = need;
    }

    const status = shortfall > 0 ? "red" : net >= 0 ? "green" : "amber";
    rows.push({ y, year: baseYear + y, c1Age, c2Age, aliveC1, aliveC2, firstDeath, total, property, debt, income, plannedDraw, expenditure, expEssential, expDiscretionary, liabRepay, premiums, contrib: contribPersonal, net, status, shortfall, taxPaid, incomeBy, ...pots });

    prevAliveC1 = aliveC1;
    prevAliveC2 = aliveC2;
    if (couple ? !aliveC1 && !aliveC2 : !aliveC1) break;
  }
  return rows;
}

/* ================================================================== */
/*  FORMAT + COLOUR                                                   */
/* ================================================================== */
const fmtFull = (v, cur) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(Math.round(v));
const fmtCompact = (v, cur) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: cur, notation: "compact", maximumFractionDigits: 1 }).format(v);
const firstName = (n, fb) => { const s = (n || "").trim(); return s || fb; };

const TYPE_HUE = {
  cash: { h: 198, s: 14, l: 68 },
  investment: { h: 214, s: 70, l: 49 },
  pension: { h: 250, s: 44, l: 61 },
  property: { h: 28, s: 56, l: 56 },
};
const TYPE_LABEL = { cash: "Cash", investment: "Investments", pension: "Pensions", property: "Property" };
const buildColors = (assets) => {
  const map = {};
  assets.forEach((a) => {
    const base = TYPE_HUE[a.type] || TYPE_HUE.investment;
    const idx = assets.filter((x) => x.type === a.type).findIndex((x) => x.id === a.id);
    map[a.id] = `hsl(${base.h} ${base.s}% ${Math.max(34, Math.min(74, base.l - idx * 8))}%)`;
  });
  return map;
};
const INCOME_LEGEND = "hsl(150 48% 42%)";
const DRAWDOWN_COLOR = "hsl(185 64% 40%)";
const buildIncomeColors = (incomes) => {
  const map = {};
  incomes.forEach((i, idx) => { map[i.id] = `hsl(${150 + idx * 18} ${50 - (idx % 2) * 8}% ${Math.max(34, 46 - Math.floor(idx / 4) * 6)}%)`; });
  return map;
};
const typeSwatch = (type) => { const b = TYPE_HUE[type]; return `hsl(${b.h} ${b.s}% ${b.l}%)`; };
const STACK_RANK = { property: 0, pension: 1, investment: 2, cash: 3 };
const TOOLTIP_RANK = { cash: 0, investment: 1, pension: 2, property: 3 };

/* ================================================================== */
/*  THEMES                                                            */
/* ================================================================== */
const THEMES = {
  light: {
    bg: "#F4F6FA", panel: "#FFFFFF", rail: "#FBFCFE", card: "#FFFFFF",
    border: "hsl(214 22% 90%)", borderStrong: "hsl(214 20% 82%)",
    ink: "#102A43", mid: "hsl(215 14% 44%)", low: "hsl(215 12% 62%)",
    accent: "#0CA5A5", accentStrong: "#102A43", accentSoft: "hsl(180 54% 95%)",
    netStroke: "hsl(212 68% 46%)", netFill: "hsl(212 72% 54%)", grid: "hsl(214 22% 92%)",
    green: "hsl(150 56% 38%)", amber: "hsl(28 80% 54%)", red: "hsl(352 70% 50%)",
    line: "hsl(215 32% 17%)", track: "hsl(214 22% 88%)",
    shadow: "0 1px 2px hsl(215 30% 20% / 0.04), 0 8px 24px hsl(215 30% 20% / 0.05)",
  },
  dark: {
    bg: "#0A0E16", panel: "#10151F", rail: "#0C111A", card: "#131A24",
    border: "rgba(255,255,255,0.08)", borderStrong: "rgba(255,255,255,0.15)",
    ink: "#F2F6FC", mid: "#97A4B9", low: "#5E6C82",
    accent: "#16B8B8", accentStrong: "#16B8B8", accentSoft: "rgba(12,165,165,0.16)",
    netStroke: "hsl(205 90% 64%)", netFill: "hsl(205 90% 60%)", grid: "rgba(255,255,255,0.06)",
    green: "hsl(160 60% 45%)", amber: "hsl(28 86% 60%)", red: "hsl(352 80% 64%)",
    line: "#E7EDF5", track: "rgba(255,255,255,0.1)", shadow: "0 10px 30px rgba(0,0,0,0.4)",
  },
};

/* ================================================================== */
/*  FIELD PRIMITIVES                                                  */
/* ================================================================== */
// Coalesces a stream of rapid values (e.g. a slider drag) to at most one
// commit per animation frame, so the chart tracks the thumb at refresh rate
// instead of firing a full reactive cycle on every pixel.
function useRafThrottle(fn) {
  const fnRef = useRef(fn); fnRef.current = fn;
  const pending = useRef(null); const raf = useRef(0);
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);
  return useCallback((v) => {
    pending.current = v;
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => { raf.current = 0; fnRef.current(pending.current); });
  }, []);
}
// Number field that stays instantly responsive while typing (local text state)
// but commits upward only after a short idle, so a value like "300000" triggers
// one reactive cycle instead of six. Commits immediately on blur or Enter.
function NumberInput({ value, onCommit, className = "", step = 1, min, commitDelay = 140 }) {
  const [txt, setTxt] = useState(value === "" || value == null ? "" : String(value));
  const focused = useRef(false);
  const timer = useRef(null);
  const pending = useRef(null);
  useEffect(() => {
    if (!focused.current) {
      const cur = txt === "" ? null : Number(txt);
      if (cur !== Number(value)) setTxt(value === "" || value == null ? "" : String(value));
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const flush = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (pending.current !== null) { onCommit(pending.current); pending.current = null; }
  };
  return (
    <input
      type="number" className={`num ${className}`} value={txt} step={step} min={min}
      onFocus={(e) => { focused.current = true; e.target.select(); }}
      onChange={(e) => {
        const raw = e.target.value;
        setTxt(raw);
        pending.current = raw === "" ? 0 : Number(raw);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => { timer.current = null; if (pending.current !== null) { onCommit(pending.current); pending.current = null; } }, commitDelay);
      }}
      onKeyDown={(e) => { if (e.key === "Enter") flush(); }}
      onBlur={() => { focused.current = false; flush(); if (txt === "") setTxt("0"); }}
    />
  );
}
const Money = ({ value, onChange, symbol }) => (
  <div className="money"><span className="money-sym">{symbol}</span><NumberInput value={value} step={1000} min={0} className="money-in" onCommit={onChange} /></div>
);
// Range slider with an instantly-responsive thumb (local state) whose upward commit is
// coalesced to one update per frame — keeps live-drag smooth even when the commit drives
// an expensive recompute (e.g. the survivor solver).
function RangeInput({ value, min, max, step = 1, onChange, ...rest }) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  const throttled = useRafThrottle(onChange);
  return <input type="range" min={min} max={max} step={step} value={local} onChange={(e) => { const v = Number(e.target.value); setLocal(v); throttled(v); }} {...rest} />;
}
const Mini = ({ value, onChange, suffix, step = 1 }) => (
  <div className="mininum"><NumberInput value={value} step={step} onCommit={onChange} />{suffix && <span>{suffix}</span>}</div>
);
const Pick = ({ value, onChange, options }) => (
  <select className="pick" value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
);
const Text = ({ value, onChange, placeholder, className = "" }) => (
  <input className={`text-in ${className}`} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
);
function Anchor({ value, onChange, owner, ectx }) {
  const v = value || { mode: "now" };
  const age = resolveAge(v, owner, ectx);
  const age0 = owner === "client2" ? ectx.age0c2 : ectx.age0c1;
  const yr = new Date().getFullYear() + ((Number(age) || age0) - age0);
  return (
    <div className="anchor">
      <select className="pick" value={v.mode} onChange={(e) => onChange({ ...v, mode: e.target.value, age: v.age || ectx.retC1 })}>
        {ANCHORS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
      </select>
      {v.mode === "age"
        ? <><NumberInput className="anchor-age" value={v.age || ectx.retC1} onCommit={(n) => onChange({ ...v, age: n })} /><span className="anchor-yr num">({yr})</span></>
        : <span className="anchor-res num">{age}{v.mode !== "now" ? <span className="anchor-yr"> ({yr})</span> : null}</span>}
    </div>
  );
}
const Toggle = ({ on, onClick, sm }) => (
  <button className={`toggle ${sm ? "sm" : ""} ${on ? "on" : ""}`} onClick={onClick}><span /></button>
);
const Seg = ({ value, onChange, options }) => (
  <div className="seg2">{options.map((o) => <button key={o.value} className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>
);
const ExpandCtl = ({ items, open, onExpand, onCollapse }) => {
  if (!items || items.length < 2) return null;
  const allOpen = items.every((x) => open.has(x.id));
  return (
    <button className="xc-btn" onClick={() => (allOpen ? onCollapse(items) : onExpand(items))}>
      {allOpen ? "Collapse all" : "Expand all"}
    </button>
  );
};

/* ================================================================== */
/*  STREAM ROW (income / expense)                                     */
/* Quick delete from a collapsed row: first click arms (turns red, "Sure?"), second confirms.
   Disarms itself after 2.2s — protects against misclicks without a clunky modal. */
function QuickDel({ onConfirm, label = "Remove" }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 2200); return () => clearTimeout(t); }, [armed]);
  return (
    <span role="button" tabIndex={0} className={`qdel ${armed ? "armed" : ""}`} title={armed ? "Click again to confirm" : label}
      onClick={(e) => { e.stopPropagation(); if (armed) onConfirm(); else setArmed(true); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); if (armed) onConfirm(); else setArmed(true); } }}>
      {armed ? <em>Sure?</em> : <Trash2 size={13} />}
    </span>
  );
}

function ClearAll({ onConfirm, count }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 2200); return () => clearTimeout(t); }, [armed]);
  if (!count) return null;
  return (
    <span role="button" tabIndex={0} className={`qdel clear-all ${armed ? "armed" : ""}`} title={armed ? "Click again to clear all" : `Clear all ${count}`}
      onClick={(e) => { e.stopPropagation(); if (armed) { onConfirm(); setArmed(false); } else setArmed(true); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); if (armed) { onConfirm(); setArmed(false); } else setArmed(true); } }}>
      {armed ? <em>Clear all?</em> : <span style={{fontSize:"11px",display:"flex",alignItems:"center",gap:4}}><Trash2 size={11} />Clear all</span>}
    </span>
  );
}

/* ================================================================== */
function StreamRow({ item, sym, kind, ectx, inflation, couple, ownerOpts, expanded, onToggle, onChange, onRemove }) {
  const per = { weekly: "/wk", monthly: "/mo", annual: "/yr", oneoff: "one-off", everyN: `/${item.everyYears}yr` }[item.frequency];
  const owner = item.owner || (kind === "expense" ? "joint" : "client1");
  const ownerName = (ownerOpts.find((o) => o.value === owner) || {}).label || "";
  return (
    <div className={`rec ${expanded ? "open" : ""}`}>
      <div className="rec-bar" role="button" tabIndex={0} onClick={onToggle} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}>
        <span className="rec-name-r">{item.name || "Untitled"}</span>
        {couple && <span className="owner-chip">{ownerName}</span>}
        {kind === "expense" && <span className={`prio ${item.priority}`}>{item.priority === "essential" ? "Ess" : "Disc"}</span>}
        <span className="rec-sum num">{sym}{(Number(item.amount) || 0).toLocaleString()} <em>{per}</em></span>
        <QuickDel onConfirm={onRemove} />
        <ChevronDown size={15} className="chev" />
      </div>
      {expanded && (
        <div className="rec-body">
          <label className="flbl">Name</label>
          <input className="rec-name" value={item.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Name" />
          {couple && <div className="rec-field"><label>Belongs to</label><Pick value={owner} onChange={(v) => onChange({ owner: v })} options={ownerOpts} /></div>}
          <div className="rec-grid">
            <div className="rec-field"><label>Amount</label><Money value={item.amount} symbol={sym} onChange={(v) => onChange({ amount: v })} /></div>
            <div className="rec-field"><label>Frequency</label><Pick value={item.frequency} onChange={(v) => onChange({ frequency: v })} options={FREQS} /></div>
          </div>
          {item.frequency === "everyN" && (
            <div className="rec-field"><label>Repeats every</label><Mini value={item.everyYears || 1} suffix="years" onChange={(v) => onChange({ everyYears: v })} /></div>
          )}
          <div className="rec-grid">
            <div className="rec-field"><label>{item.frequency === "oneoff" ? "Occurs at" : "Starts"}</label><Anchor value={item.start} owner={owner} ectx={ectx} onChange={(v) => onChange({ start: v })} /></div>
            {item.frequency !== "oneoff" && <div className="rec-field"><label>Ends</label><Anchor value={item.end} owner={owner} ectx={ectx} onChange={(v) => onChange({ end: v })} /></div>}
          </div>
          <div className="rec-grid">
            <div className="rec-field"><label>Increase</label><Pick value={item.escalation} onChange={(v) => onChange({ escalation: v })} options={ESCS} />{item.escalation === "inflation" && <span className="inl-note">at {inflation}%</span>}</div>
            {item.escalation === "custom"
              ? <div className="rec-field"><label>Rate</label><Mini value={item.customEsc || 0} step={0.1} suffix="%" onChange={(v) => onChange({ customEsc: v })} /></div>
              : kind === "expense" && <div className="rec-field"><label>Priority</label><Pick value={item.priority} onChange={(v) => onChange({ priority: v })} options={PRIORITIES} /></div>}
          </div>
          {item.escalation === "custom" && kind === "expense" && (
            <div className="rec-field"><label>Priority</label><Pick value={item.priority} onChange={(v) => onChange({ priority: v })} options={PRIORITIES} /></div>
          )}
          {kind === "income" && (
            <div className="rec-field"><label>Tax treatment <InfoTip text="Net / take-home is the default — the amount lands in the plan untaxed (right for UAE and other tax-free income, or anything you've already entered after tax). Choose Gross / taxable for income that should be taxed when a jurisdiction with income-tax bands is active — typically a UK salary, state pension or rental income from the point the client becomes UK-resident. It's only ever taxed in periods that have bands, so a gross income in a tax-free period still arrives in full." /></label><Pick value={item.taxTreatment || "net"} onChange={(v) => onChange({ taxTreatment: v })} options={TAXTREAT} />{(item.taxTreatment || "net") === "gross" && <span className="inl-note">taxed when a tax jurisdiction is active</span>}</div>
          )}
          {couple && kind === "income" && owner !== "joint" && (
            <div className="rec-grid">
              <div className="rec-field"><label>On {ownerName}'s death <InfoTip text="What happens to this income when its owner dies: stop entirely, or continue to the survivor at a chosen percentage — for example a 50% spouse's pension." /></label><Pick value={(item.onDeath || {}).mode || "cease"} onChange={(v) => onChange({ onDeath: { ...(item.onDeath || { pct: 50 }), mode: v } })} options={DEATH_MODES} /></div>
              {((item.onDeath || {}).mode === "continue") && <div className="rec-field"><label>At</label><Mini value={(item.onDeath || {}).pct ?? 50} suffix="%" onChange={(v) => onChange({ onDeath: { ...(item.onDeath || { mode: "continue" }), pct: v } })} /></div>}
            </div>
          )}
          {couple && kind === "expense" && owner === "joint" && <span className="inl-note">Scales to the survivor rate after the first death.</span>}
          <button className="del-row" onClick={onRemove}><Trash2 size={13} /> Remove</button>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  APP                                                               */
/* ================================================================== */
export default function RunwayApp({ initialData = null, onChange = null, scenarios = null, activeScenarioId = null, compareScenarioId = null, compareName = null, compareData = null, onScenarioAction = null, firmSettings = null, onFirmSettingsChange = null }) {
  const seed = initialData || SEED;
  // Sanitise: property assets should never silently default to drawable. Any legacy plan saved before
  // this fix may have drawdown:true on a property — correct it on load. The adviser can still turn
  // drawdown on explicitly (e.g. for a BTL they plan to sell), but it must be a conscious choice.
  const sanitiseAssets = (as) => as.map((a) => a.type === "property" && a.drawdown ? { ...a, drawdown: false } : a);
  const [theme, setTheme] = useState("light");
  const [present, setPresent] = useState(false);
  const [section, setSection] = useState("assets");
  const [chartView, setChartView] = useState("composition");
  const [moneyMode, setMoneyMode] = useState("real");
  const [open, setOpen] = useState(() => new Set());
  const [whatIf, setWhatIf] = useState({ growth: 0, inflation: 0, life: 0 });
  const [goalOpen, setGoalOpen] = useState(false);
  const [stressOpen, setStressOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  // Monte Carlo — confidence overlay. Result is computed off the reactive path (only while open) and cached.
  // The last result is persisted with the plan (via onChange) so reopening doesn't require a re-run,
  // as long as the plan inputs haven't changed. The sig detects staleness on load.
  const [mcOpen, setMcOpen] = useState(false);
  const [mcLevel, setMcLevel] = useState((seed.mcResult && seed.mcResult.level) || "typical");
  const [mcResult, setMcResult] = useState(seed.mcResult || null); // { prob, fan, sig, level }
  const [mcRun, setMcRun] = useState({ running: false, progress: 0 });
  const mcToken = useRef(0);
  const [stress, setStress] = useState(null);
  // Configuration for the active stress scenario. timing: "now" | "retirement"; lens: "uk" | "global";
  // affects: "growth" (equities/pensions only) | "all"; custom: editable sequence of annual returns.
  const [stressCfg, setStressCfg] = useState({ timing: "now", lens: "global", affects: "growth", custom: [-25, 10, 8] });
  const upStressCfg = (patch) => setStressCfg((c) => ({ ...c, ...patch }));
  const [ci, setCi] = useState(null);
  const [ciDraft, setCiDraft] = useState({ owner: "client1", age: 65, amount: 250000 });
  const [survivorOverlay, setSurvivorOverlay] = useState(null); // { owner, deathAge } — mirrors death to chart
  // Stress / critical-illness / survivor are three mutually-exclusive chart overlays. They MUST never be
  // active at once, or the headline label and the projected rows read from different scenarios (e.g. a
  // stale CI label appearing over a lost-decade stress). These helpers are the only sanctioned way to
  // set one — each clears the other two — so the exclusivity can't be forgotten at a call site.
  const applyStress = (id) => { setStress(id); setCi(null); setSurvivorOverlay(null); };
  const applyCi = (draft) => { setCi(draft ? { ...draft } : null); setStress(null); setSurvivorOverlay(null); };
  const applySurvivor = (ov) => { setSurvivorOverlay(ov); setStress(null); setCi(null); };
  const clearScenario = () => { setStress(null); setCi(null); setSurvivorOverlay(null); };
  const [annotations, setAnnotations] = useState(seed.annotations || []);

  const [profile, setProfile] = useState(seed.profile);
  const [assumptions, setAssumptions] = useState(seed.assumptions);
  const [assets, setAssets] = useState(() => sanitiseAssets(seed.assets));
  const [incomes, setIncomes] = useState(seed.incomes);
  const [expenses, setExpenses] = useState(seed.expenses);
  const [liabilities, setLiabilities] = useState(seed.liabilities || []);
  const [protection, setProtection] = useState(seed.protection || []);
  const [adviserNotes, setAdviserNotes] = useState(seed.adviserNotes || "");

  const REPORT_CFG_KEY = "runway_report_cfg";
  const defaultReportCfg = () => ({
    sections: { exec: true, snapshot: true, yeartable: true, charts: true, cashgap: true, stress: true, protection: true, whatif: false, inputs: true, assumptions: true, taxov: true, commentary: true },
    anonymous: false, adviser: "", firm: "",
  });
  // Per-plan report preferences. Priority: the plan's own saved reportCfg → legacy global localStorage
  // (so existing users keep their layout the first time) → defaults. Once set, it travels with the plan
  // via onChange (i.e. into Supabase), so each client can have its own report layout.
  const [reportCfg, setReportCfg] = useState(() => {
    const merge = (saved) => saved ? { ...defaultReportCfg(), ...saved, sections: { ...defaultReportCfg().sections, ...(saved.sections || {}) } } : null;
    const fromPlan = merge(seed.reportCfg);
    if (fromPlan) return fromPlan;
    if (typeof window === "undefined") return defaultReportCfg();
    try { return merge(JSON.parse(localStorage.getItem(REPORT_CFG_KEY) || "null")) || defaultReportCfg(); } catch { return defaultReportCfg(); }
  });

  // Report the full plan upward so the host can persist it (autosave). Debounced so a burst of
  // edits (typing, dragging) results in a single save once things settle, not one per keystroke.
  useEffect(() => {
    if (!onChange) return;
    const id = setTimeout(() => {
      onChange({ profile, assumptions, assets, incomes, expenses, liabilities, protection, annotations, adviserNotes, reportCfg, mcResult });
    }, 600);
    return () => clearTimeout(id);
  }, [profile, assumptions, assets, incomes, expenses, liabilities, protection, annotations, adviserNotes, reportCfg, mcResult]); // eslint-disable-line react-hooks/exhaustive-deps

  // Publish the theme to the document root so the surrounding app shell (top bar, dashboard chrome) matches dark/light.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.documentElement.getAttribute("data-theme");
    document.documentElement.setAttribute("data-theme", theme);
    return () => { if (prev) document.documentElement.setAttribute("data-theme", prev); else document.documentElement.removeAttribute("data-theme"); };
  }, [theme]);

  // What-if overlay — adjusts the inputs that feed the projection without changing the saved plan
  const whatIfActive = whatIf.growth !== 0 || whatIf.inflation !== 0 || whatIf.life !== 0;
  const resetWhatIf = () => setWhatIf({ growth: 0, inflation: 0, life: 0 });
  const effAssets = useMemo(() => (whatIf.growth === 0 ? assets : assets.map((a) => ({ ...a, growthRate: (Number(a.growthRate) || 0) + whatIf.growth }))), [assets, whatIf.growth]);
  const effAssumptions = useMemo(() => (whatIf.inflation === 0 ? assumptions : { ...assumptions, inflation: (Number(assumptions.inflation) || 0) + whatIf.inflation }), [assumptions, whatIf.inflation]);
  const effProfile = useMemo(() => (whatIf.life === 0 ? profile : { ...profile, client1: { ...profile.client1, lifeExpectancy: (Number(profile.client1.lifeExpectancy) || 95) + whatIf.life }, client2: { ...profile.client2, lifeExpectancy: (Number(profile.client2.lifeExpectancy) || 95) + whatIf.life } }), [profile, whatIf.life]);

  const t = THEMES[theme];
  const cur = profile.currency;
  const sym = CURRENCIES[cur].symbol;
  const couple = profile.couple;
  const c1 = profile.client1;
  const c2 = profile.client2;
  const fn1 = firstName(c1.name, "Client 1");
  const fn2 = firstName(c2.name, "Client 2");
  const ectx = useMemo(() => makeCtx(effProfile, effAssumptions), [effProfile, effAssumptions]);
  const baseYear = new Date().getFullYear();

  const showReal = present ? true : moneyMode === "real";
  const showComposition = present ? true : chartView === "composition";

  const ownerOpts = useMemo(() => [
    { value: "client1", label: fn1 },
    { value: "client2", label: fn2 },
    { value: "joint", label: "Joint" },
  ], [fn1, fn2]);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(link);
    return () => { try { document.head.removeChild(link); } catch (e) {} };
  }, []);

  const autoInvest = effAssumptions.autoInvestSurplus !== false; // default on (back-compat)
  const rows = useMemo(
    () => projectCashflow({ profile: effProfile, assumptions: effAssumptions, assets: effAssets, incomes, expenses, liabilities, protection, autoInvestSurplus: autoInvest }),
    [effProfile, effAssumptions, effAssets, incomes, expenses, liabilities, protection, autoInvest]
  );
  const stressShocks = useMemo(() => {
    if (!stress) return null;
    const sc = stressById(stress);
    if (!sc) return null;
    const retOff = Math.max(0, ectx.retC1 - ectx.age0c1);
    const start = sc.timingable && stressCfg.timing === "retirement" ? retOff : 0;
    let shocks;
    if (sc.id === "custom") {
      shocks = {};
      (stressCfg.custom || []).forEach((v, i) => { if (v != null && v !== "" && !isNaN(Number(v))) shocks[start + i] = Number(v); });
    } else {
      shocks = sc.build(start, ectx.planEndYear, stressCfg.lens);
    }
    if (!shocks || !Object.keys(shocks).length) return null;
    return { shocks, shockTypes: AFFECTS[stressCfg.affects] ?? null, shockMode: sc.mode };
  }, [stress, stressCfg, ectx]);
  const ciClaimYear = useMemo(() => {
    if (!ci) return null;
    const age0 = ci.owner === "client2" ? ectx.age0c2 : ectx.age0c1;
    return Math.max(0, Math.round((Number(ci.age) || age0) - age0));
  }, [ci, ectx]);
  const stressRows = useMemo(() => {
    const baseArgs = { profile: effProfile, assumptions: effAssumptions, assets: effAssets, incomes, expenses, liabilities, protection, autoInvestSurplus: autoInvest };
    if (ci) return projectCashflow({ ...baseArgs, lumpSums: [{ year: ciClaimYear, amount: Number(ci.amount) || 0 }], incomeStop: { owner: ci.owner, year: ciClaimYear } });
    if (survivorOverlay) {
      const sovProf = { ...effProfile, [survivorOverlay.owner]: { ...effProfile[survivorOverlay.owner], lifeExpectancy: survivorOverlay.deathAge } };
      // The engine already pays any in-force life cover into the pot in the year of death (see the
      // protection loop in projectCashflow). We must NOT inject it again here, or the survivor's pot
      // would receive the sum assured twice and the plan would look far healthier than it is.
      const sovExp = survivorOverlay.essentialOnly ? expenses.filter((e) => (e.priority || "essential") !== "discretionary") : expenses;
      return projectCashflow({ ...baseArgs, profile: sovProf, expenses: sovExp });
    }
    if (stressShocks) return projectCashflow({ ...baseArgs, shocks: stressShocks.shocks, shockTypes: stressShocks.shockTypes, shockMode: stressShocks.shockMode });
    return null;
  }, [ci, ciClaimYear, survivorOverlay, stressShocks, effProfile, effAssumptions, effAssets, incomes, expenses, liabilities, protection, ectx, autoInvest]);
  const colors = useMemo(() => buildColors(assets), [assets]);
  const incColors = useMemo(() => buildIncomeColors(incomes), [incomes]);
  const stackOrder = useMemo(() => [...assets].sort((a, b) => STACK_RANK[a.type] - STACK_RANK[b.type]), [assets]);
  const tooltipOrder = useMemo(() => [...assets].sort((a, b) => TOOLTIP_RANK[a.type] - TOOLTIP_RANK[b.type]), [assets]);
  const legendTypes = useMemo(() => { const s = []; tooltipOrder.forEach((a) => { if (!s.includes(a.type)) s.push(a.type); }); return s; }, [tooltipOrder]);
  const hasProperty = useMemo(() => assets.some((a) => a.type === "property"), [assets]);

  const inflDec = (Number(effAssumptions.inflation) || 0) / 100;

  // Monte Carlo runner. Computes ONLY while the overlay is open, in small async chunks so the UI never
  // blocks, and caches by an input signature so reopening an unchanged plan is instant. The reactive
  // plan/chart path never triggers this — it is fully isolated from normal editing.
  const mcSig = useMemo(
    () => (mcOpen || (reportOpen && reportCfg.sections.mcconf))
      ? JSON.stringify({ p: effProfile, a: effAssumptions, s: effAssets, i: incomes, e: expenses, l: liabilities, r: protection, ai: autoInvest, lv: mcLevel })
      : "",
    [mcOpen, reportOpen, reportCfg.sections.mcconf, effProfile, effAssumptions, effAssets, incomes, expenses, liabilities, protection, autoInvest, mcLevel]
  );
  useEffect(() => {
    // Runs when: (a) the MC overlay is open, or (b) the report opens and the section is ticked but
    // no fresh result exists. In case (b) we compute silently in the background without showing
    // the overlay — the report options panel shows a small "running…" indicator instead.
    const shouldRun = mcOpen || (reportOpen && reportCfg.sections.mcconf);
    if (!shouldRun) return;
    if (mcResult && mcResult.sig === mcSig) return; // cached and still fresh
    const years = rows.length;
    if (!years) return;
    const token = ++mcToken.current;
    const levelMult = (MC_LEVELS.find((l) => l.id === mcLevel) || MC_LEVELS[1]).mult;
    const vol = volByTypeFor(effAssets, levelMult);
    const baseArgs = { profile: effProfile, assumptions: effAssumptions, assets: effAssets, incomes, expenses, liabilities, protection, autoInvestSurplus: autoInvest };
    const rng = mulberry32(MC_SEED), norm = makeNormal(rng);
    const N = MC_RUNS, CHUNK = 25;
    const cols = Array.from({ length: years }, () => new Float64Array(N));
    let i = 0, successes = 0;
    setMcRun({ running: true, progress: 0 });
    const step = () => {
      if (token !== mcToken.current) return; // superseded or overlay closed
      const end = Math.min(i + CHUNK, N);
      for (; i < end; i++) {
        const path = new Array(years);
        for (let y = 0; y < years; y++) path[y] = norm();
        const rs = projectCashflow({ ...baseArgs, marketPath: path, volByType: vol });
        let failed = false;
        for (let y = 0; y < years; y++) {
          const r = rs[y]; if (!r) continue;
          if ((r.shortfall || 0) > 0) failed = true;
          cols[y][i] = Math.max(0, (r.total || 0) - (r.property || 0) - (r.debt || 0)); // spendable
        }
        if (!failed) successes++;
      }
      if (i < N) { setMcRun({ running: true, progress: i / N }); setTimeout(step, 0); return; }
      const pct = (arr, p) => { const a = Array.from(arr).sort((x, z) => x - z); const idx = (a.length - 1) * p; const lo = Math.floor(idx), hi = Math.ceil(idx); return a[lo] + (a[hi] - a[lo]) * (idx - lo); };
      const fan = [];
      for (let y = 0; y < years; y++) { const c = cols[y]; fan.push({ year: baseYear + y, y, p10: pct(c, 0.1), p25: pct(c, 0.25), p50: pct(c, 0.5), p75: pct(c, 0.75), p90: pct(c, 0.9) }); }
      setMcResult({ prob: (successes / N) * 100, fan, sig: mcSig, level: mcLevel });
      setMcRun({ running: false, progress: 1 });
    };
    setTimeout(step, 0);
    return () => { mcToken.current++; setMcRun((s) => (s.running ? { running: false, progress: 0 } : s)); }; // cancel in-flight on close/change
  }, [mcOpen, reportOpen, reportCfg.sections.mcconf, mcSig, rows.length, baseYear]); // eslint-disable-line react-hooks/exhaustive-deps

  // Comparison scenario — projected with its own assumptions, deflated by its own inflation,
  // then aligned to the active plan's chart by calendar year.
  const compareMap = useMemo(() => {
    if (!compareData || !compareData.profile) return null;
    try {
      const crows = projectCashflow({
        profile: compareData.profile, assumptions: compareData.assumptions || {},
        assets: compareData.assets || [], incomes: compareData.incomes || [],
        expenses: compareData.expenses || [], liabilities: compareData.liabilities || [],
        protection: compareData.protection || [],
        autoInvestSurplus: (compareData.assumptions || {}).autoInvestSurplus !== false,
      });
      const cInfl = (Number((compareData.assumptions || {}).inflation) || 0) / 100;
      const mp = new Map();
      let lifeTax = 0;
      crows.forEach((r) => { const f = showReal ? Math.pow(1 + cInfl, r.y) : 1; mp.set(r.year, (r.total - (r.debt || 0)) / f); lifeTax += (r.taxPaid || 0) / f; });
      mp.lifeTax = lifeTax;
      return mp;
    } catch { return null; }
  }, [compareData, showReal]);

  const data = useMemo(() => rows.map((r, idx) => {
    const f = showReal ? Math.pow(1 + inflDec, r.y) : 1;
    const dz = (v) => v / f;
    const sr = stressRows && stressRows[idx] ? stressRows[idx] : null;
    const flow = sr || r; // money-in-vs-out reflects the active scenario (e.g. CI salary drop, crash depletion)
    const o = { year: r.year, y: r.y, c1Age: r.c1Age, c2Age: r.c2Age, aliveC1: r.aliveC1, aliveC2: r.aliveC2, total: dz(r.total), property: dz(r.property), investable: dz(r.total - r.property), debt: dz(r.debt || 0), netWorth: dz(r.total - (r.debt || 0)), income: dz(flow.income), expenditure: dz(flow.expenditure), taxPaid: dz(flow.taxPaid || 0), contrib: dz(flow.contrib || 0), outgoings: dz(flow.expenditure + (flow.contrib || 0)), expEssential: dz(flow.expEssential || 0), expDiscretionary: dz(flow.expDiscretionary || 0), premiums: dz(flow.premiums || 0), liabRepay: dz(flow.liabRepay || 0) };
    if (sr) {
      o.stressed = dz(sr.total - (sr.debt || 0));
      o.sTotal = dz(sr.total);
      o.sInvestable = dz(sr.total - sr.property);
      o.sDebt = dz(sr.debt || 0);
      o.sNeg = Math.min(0, o.stressed);
      assets.forEach((a) => (o["s_" + aKey(a.id)] = dz(sr[aKey(a.id)] || 0)));
    }
    o.nwNeg = Math.min(0, o.netWorth);
    if (compareMap && compareMap.has(r.year)) o.cmp = compareMap.get(r.year);
    assets.forEach((a) => (o[aKey(a.id)] = dz(r[aKey(a.id)] || 0)));
    incomes.forEach((i) => (o[iKey(i.id)] = dz(flow.incomeBy[i.id] || 0)));
    o.plannedDraw = dz(flow.plannedDraw || 0);
    const gap = Math.max(0, (flow.expenditure + (flow.contrib || 0)) - flow.income - (flow.plannedDraw || 0));
    o.coveredBySavings = dz(Math.max(0, gap - flow.shortfall));
    o.uncovered = dz(flow.shortfall);
    return o;
  }), [rows, showReal, inflDec, assets, incomes, stressRows, compareMap]);

  // True when net worth (or the stressed line) dips below £0 — i.e. debts outlive assets and the
  // plan goes underwater. Drives the red below-zero fill and the £0 baseline on the net worth chart.
  const nwHasNeg = useMemo(() => data.some((d) => d.netWorth < 0 || (d.stressed != null && d.stressed < 0)), [data]);

  const stressImpact = useMemo(() => {
    if (!stressRows) return null;
    const sc = stressById(stress);
    const ageOf = (dr) => (dr ? (dr.aliveC1 ? dr.c1Age : dr.c2Age) : null);
    let scenarioLabel = "";
    if (sc) {
      const bits = [sc.label];
      if (sc.timingable && stressCfg.timing === "retirement") bits.push("at retirement");
      if (sc.lensable) bits.push(stressCfg.lens === "global" ? "global equity" : "UK equity");
      scenarioLabel = bits.join(" · ");
    }
    const label = ci ? `Critical illness claim · ${ci.owner === "client2" ? fn2 : fn1} age ${ci.age}` : survivorOverlay ? `Survivor plan · ${survivorOverlay.owner === "client2" ? fn2 : fn1} dies age ${survivorOverlay.deathAge}${survivorOverlay.essentialOnly ? " · essentials only" : ""}` : scenarioLabel;
    return { label, baseAge: ageOf(rows.find((r) => r.shortfall > 0)), stressAge: ageOf(stressRows.find((r) => r.shortfall > 0)) };
  }, [stressRows, rows, stress, stressCfg, ci, survivorOverlay, fn1, fn2]);

  // Decompose the survivor-plan impact so the headline net-worth swing isn't misread as "the payout".
  // The swing is cover + lower (survivor-rate) household spending − the deceased's lost earnings.
  const survivorSummary = useMemo(() => {
    if (!survivorOverlay || !stressRows) return null;
    const baseArgs = { profile: effProfile, assumptions: effAssumptions, assets: effAssets, incomes, expenses, liabilities, protection, autoInvestSurplus: autoInvest };
    const o = survivorOverlay.owner;
    const sovProf = { ...effProfile, [o]: { ...effProfile[o], lifeExpectancy: survivorOverlay.deathAge } };
    const sovExp = survivorOverlay.essentialOnly ? expenses.filter((e) => (e.priority || "essential") !== "discretionary") : expenses;
    const cover = protection.filter((p) => (p.ptype || "life") !== "ci" && (p.insured || "client1") === o && (Number(p.coverToAge) || 0) > survivorOverlay.deathAge).reduce((s, p) => s + (Number(p.sumAssured) || 0), 0);
    // "No cover" = the same death, but with this person's life policies removed entirely, so the engine
    // pays nothing on death. (Passing lumpSums:[] is not enough — the engine pays in-force cover
    // automatically from the protection array.) The difference isolates what the cover is worth.
    const protNoCover = protection.filter((p) => !((p.ptype || "life") !== "ci" && (p.insured || "client1") === o));
    const noCoverRows = projectCashflow({ ...baseArgs, profile: sovProf, expenses: sovExp, protection: protNoCover });
    const realEnd = (rws) => { if (!rws.length) return 0; const last = rws[rws.length - 1]; const f = showReal ? Math.pow(1 + inflDec, last.y) : 1; return (last.total - (last.debt || 0)) / f; };
    const baseEnd = realEnd(rows), withCoverEnd = realEnd(stressRows), noCoverEnd = realEnd(noCoverRows);
    const survDep = stressRows.find((r) => r.shortfall > 0);
    return {
      cover,
      coverEffect: withCoverEnd - noCoverEnd,   // the cover, grown to plan end
      deathEffect: noCoverEnd - baseEnd,         // lost income net of lower survivor-rate spending
      total: withCoverEnd - baseEnd,
      survFundedAge: survDep ? (survDep.aliveC1 ? survDep.c1Age : survDep.c2Age) : null,
      survName: o === "client2" ? fn1 : fn2,     // the person who survives is the OTHER partner
      deathAge: survivorOverlay.deathAge,
      diedName: o === "client2" ? fn2 : fn1,
    };
  }, [survivorOverlay, stressRows, rows, effProfile, effAssumptions, effAssets, incomes, expenses, liabilities, protection, autoInvest, showReal, inflDec, fn1, fn2]);

  const markers = useMemo(() => {
    const retC1 = ectx.retC1 - ectx.age0c1;
    const retC2 = ectx.retC2 - ectx.age0c2;
    const deathRow = couple ? rows.find((r) => r.firstDeath) : null;
    return {
      retC1: retC1 > 0 && retC1 <= ectx.planEndYear ? baseYear + retC1 : null,
      retC2: couple && retC2 > 0 && retC2 <= ectx.planEndYear ? baseYear + retC2 : null,
      firstDeath: deathRow ? deathRow.year : null,
    };
  }, [ectx, rows, couple, baseYear]);

  const hasDebt = useMemo(() => liabilities.some((L) => (Number(L.balance) || 0) > 0), [liabilities]);

  const hasContrib = useMemo(() => assets.some((a) => a.contribution && a.contribution.enabled && (a.contribution.source !== "employer" || a.type !== "pension") && (Number(a.contribution.amount) || 0) > 0), [assets]);
  const hasPlannedDraw = useMemo(() => assets.some((a) => a.withdrawal && a.withdrawal.enabled && (Number(a.withdrawal.amount) || 0) > 0), [assets]);
  const kpis = useMemo(() => {
    const grossNow = assets.reduce((s, a) => s + (Number(a.value) || 0), 0);
    const debtNow = liabilities.reduce((s, L) => s + (Number(L.balance) || 0), 0);
    const currentTotal = grossNow - debtNow;
    const peak = data.reduce((m, r) => Math.max(m, r.netWorth), 0);
    const retRow = data.find((r) => r.c1Age === ectx.retC1);
    const atRetirement = ectx.retC1 <= ectx.age0c1 ? currentTotal : retRow ? retRow.netWorth : 0;
    const endVal = data.length ? data[data.length - 1].netWorth : 0;
    const endYear = data.length ? data[data.length - 1].year : baseYear;
    const depRow = rows.find((r) => r.shortfall > 0);
    let depletionAge = null, depYear = null, depName = null, depRet = ectx.retC1;
    if (depRow) {
      const useC2 = couple && !depRow.aliveC1 && depRow.aliveC2; // only the younger partner is still alive
      depletionAge = useC2 ? depRow.c2Age : depRow.c1Age;
      depYear = depRow.year;
      depName = couple ? (useC2 ? fn2 : fn1) : null;
      depRet = useC2 ? ectx.retC2 : ectx.retC1;
    }
    const tone = depletionAge === null ? "green" : depletionAge < 88 ? "red" : "amber";
    // Stressed variants — read directly from stressRows (the raw engine output) so the headline cards
    // always agree with stressImpact and the stress-page verdict. Previously these read from `data[]`
    // which is a deflated display layer derived from rows+stressRows — two memo hops away. During
    // React's async render batching that caused kpis.s to momentarily reflect stale base values while
    // stressImpact (also from stressRows directly) was already correct.
    let s = null;
    if (stressRows && stressRows.length) {
      const sLast = stressRows[stressRows.length - 1];
      const inflF = (y) => Math.pow(1 + inflDec, y);
      const sEndVal = showReal
        ? Math.max(0, (sLast.total - (sLast.debt || 0))) / inflF(sLast.y)
        : Math.max(0, sLast.total - (sLast.debt || 0));
      const sRetRow = stressRows.find((r) => r.c1Age === ectx.retC1);
      const sAtRetBase = sRetRow ? Math.max(0, sRetRow.total - (sRetRow.debt || 0)) : 0;
      const sAtRetirement = ectx.retC1 <= ectx.age0c1 ? currentTotal
        : showReal ? sAtRetBase / inflF(sRetRow ? sRetRow.y : 0) : sAtRetBase;
      const sDepRow = stressRows.find((r) => r.shortfall > 0);
      let sDepletionAge = null, sDepYear = null;
      if (sDepRow) {
        const useC2 = couple && !sDepRow.aliveC1 && sDepRow.aliveC2;
        sDepletionAge = useC2 ? sDepRow.c2Age : sDepRow.c1Age;
        sDepYear = sDepRow.year;
      }
      const sTone = sDepletionAge === null ? "green" : sDepletionAge < 88 ? "red" : "amber";
      s = { atRetirement: sAtRetirement, endVal: sEndVal, depletionAge: sDepletionAge, depYear: sDepYear, tone: sTone };
    }
    return { currentTotal, peak, atRetirement, endVal, endYear, depletionAge, depYear, depName, depRet, tone, s };
  }, [rows, stressRows, assets, liabilities, ectx, baseYear, couple, fn1, fn2, inflDec, showReal]);

  const banner = useMemo(() => {
    // When a stress scenario is active, the banner reflects the stressed outcome, not the base plan.
    const active = kpis.s || null;
    const depAge = active ? active.depletionAge : kpis.depletionAge;
    const depYr  = active ? active.depYear      : kpis.depYear;
    const tone   = active ? active.tone         : kpis.tone;
    // Only show the "property excluded" note when property is genuinely NOT being drawn down.
    // If the adviser has marked a property as drawable (e.g. a BTL they plan to sell), the note
    // would be wrong, so suppress it.
    const hasNonDrawableProperty = assets.some((a) => a.type === "property" && !a.drawdown);
    const propNote = hasNonDrawableProperty ? " — held property is excluded as it isn't being spent" : "";

    if (depAge === null) {
      return active
        ? { tone: "green", Icon: CheckCircle2, text: "Plan remains fully funded under this scenario — investable assets last to the end of the plan." }
        : { tone: "green", Icon: CheckCircle2, text: "Plan is fully funded — investable assets last to the end of the plan." };
    }
    const into = depAge - kpis.depRet;
    const tail = into > 0 ? `${into} year${into === 1 ? "" : "s"} into retirement` : "before the planned retirement age";
    const who = kpis.depName ? `${kpis.depName} aged ${depAge}` : `age ${depAge}`;
    const scenarioNote = active ? " under this scenario" : "";
    return { tone, Icon: tone === "red" ? XCircle : AlertTriangle, text: `Spendable assets run short in ${depYr}, around ${who} (${tail})${scenarioNote}${propNote}.` };
  }, [kpis, assets]);

  const eventList = useMemo(() => {
    const ev = [];
    if (markers.retC1) {
      const c1IsDead = survivorOverlay && survivorOverlay.owner === "client1";
      const c2IsDead = survivorOverlay && survivorOverlay.owner === "client2";
      // If both retire the same year and neither is dead, collapse to one marker
      if (couple && markers.retC2 === markers.retC1 && !c1IsDead && !c2IsDead) {
        ev.push({ label: "Both retire", year: markers.retC1, color: t.ink });
      } else {
        if (!c1IsDead) ev.push({ label: couple ? `${fn1} retires` : "Retirement", year: markers.retC1, color: t.ink });
        if (markers.retC2) {
          if (!c2IsDead) ev.push({ label: `${fn2} retires`, year: markers.retC2, color: t.ink });
        }
      }
    } else if (markers.retC2) {
      const c2IsDead = survivorOverlay && survivorOverlay.owner === "client2";
      if (!c2IsDead) ev.push({ label: `${fn2} retires`, year: markers.retC2, color: t.ink });
    }
    // First death marker: use the survivor overlay death year if active (red), else base plan's projected first death (grey)
    if (survivorOverlay) {
      const diedName = survivorOverlay.owner === "client2" ? fn2 : fn1;
      const deathYear = baseYear + (survivorOverlay.deathAge - (survivorOverlay.owner === "client2" ? ectx.age0c2 : ectx.age0c1));
      ev.push({ label: `${diedName} dies age ${survivorOverlay.deathAge}${survivorOverlay.essentialOnly ? " · essentials only" : ""}`, year: deathYear, color: t.red, isSurvivorDeath: true });
    } else if (markers.firstDeath) {
      ev.push({ label: "First death", year: markers.firstDeath, color: t.mid });
    }
    if (kpis.depYear) ev.push({ label: "Funds run short", year: kpis.depYear, color: t.red });
    return ev;
  }, [markers, kpis.depYear, couple, fn1, fn2, t]);

  // Inflow events — money paid INTO the plan (life cover on death, a CI claim while stress-testing).
  // These explain a step-up in the net-worth line that would otherwise look unexplained.
  const payoutEvents = useMemo(() => {
    const ev = [];
    const c1Death = rows.find((r) => !r.aliveC1);
    const c2Death = couple ? rows.find((r) => !r.aliveC2) : null;
    protection.forEach((p) => {
      if ((p.ptype || "life") === "ci") return;
      const o = p.insured || "client1";
      const dr = o === "client2" ? c2Death : c1Death;
      if (!dr) return;
      const ageAtDeath = o === "client2" ? dr.c2Age : dr.c1Age;
      if (p.coverToAge && Number(p.coverToAge) < 110 && ageAtDeath > Number(p.coverToAge)) return;
      if ((Number(p.sumAssured) || 0) <= 0) return;
      ev.push({ label: `Life cover ${fmtFull(Number(p.sumAssured) || 0, cur)}`, year: dr.year, color: t.green });
    });
    if (ci && ciClaimYear != null) ev.push({ label: `CI claim ${fmtFull(Number(ci.amount) || 0, cur)}`, year: baseYear + ciClaimYear, color: t.green });
    return ev;
  }, [protection, rows, couple, ci, ciClaimYear, baseYear, cur, t]);

  // "What if I asked…" — answers the questions clients actually ask, each solved against the pure engine.
  // Uses the real saved plan (not the what-if overlay). Binary/linear scans; only runs while the panel is open.
  /* ---- Report configuration & derived analysis ---------------------------------------------- */
  const [reportStage, setReportStage] = useState("options"); // "options" | "view"
  const [commentaryEdit, setCommentaryEdit] = useState(null); // null = follow generated
  const [copiedSummary, setCopiedSummary] = useState(false);
  // Update prefs in state. We deliberately do NOT write to the global localStorage key any more —
  // persistence is per-plan through onChange. (The legacy key is still read once above for migration.)
  const upReportCfg = (patch) => setReportCfg((c) => ({ ...c, ...patch, sections: { ...c.sections, ...(patch.sections || {}) } }));
  const stressActive = !!stressImpact;

  // Year-by-year summary at key ages — the Voyant/CashCalc-style table for the report.
  // Picks: now, every 5 years, each retirement, first death, depletion year, and plan end.
  const yearTable = useMemo(() => {
    if (!rows.length) return [];
    const want = new Set();
    want.add(rows[0].year);
    rows.forEach((r) => { if ((r.c1Age % 5) === 0) want.add(r.year); });
    if (markers.retC1) want.add(markers.retC1);
    if (markers.retC2) want.add(markers.retC2);
    if (markers.firstDeath) want.add(markers.firstDeath);
    if (kpis.depYear) want.add(kpis.depYear);
    want.add(rows[rows.length - 1].year);
    const defl = (v, y) => (showReal ? v / Math.pow(1 + inflDec, y) : v);
    return rows.filter((r) => want.has(r.year)).map((r) => {
      const netWorth = defl(r.total - (r.debt || 0), r.y);
      const investable = defl(r.total - r.property, r.y);
      const income = defl(r.income + (r.plannedDraw || 0), r.y);
      const spend = defl(r.expenditure, r.y);
      const surplus = income - spend;
      return { year: r.year, c1Age: r.c1Age, c2Age: r.c2Age, aliveC1: r.aliveC1, aliveC2: r.aliveC2, netWorth, investable, income, spend, surplus, shortfall: defl(r.shortfall || 0, r.y), isRet: r.year === markers.retC1 || r.year === markers.retC2, isDep: r.year === kpis.depYear };
    });
  }, [rows, markers, kpis, showReal, inflDec]);

  // Cash gap analysis — base plan (ignores any active stress overlay), in the report's money basis.
  // Three states: no draw at all · one-off years only · sustained drawdown.
  // The rows to use for cash gap and plan phases — follows the active scenario when one is live,
  // so the gap panel updates to reflect stress/CI/survivor overlays rather than staying frozen on the base plan.
  const activeRows = (stress || ci || survivorOverlay) && stressRows ? stressRows : rows;

  const computeCashGap = (srcRows, defl) => {
    const drawOf = (r) => Math.max(0, (r.expenditure + (r.contrib || 0)) - r.income - (r.plannedDraw || 0) - (r.shortfall || 0));
    const drawRows = srcRows.map((r) => ({ ...r, draw: defl(r.draw !== undefined ? r.draw : drawOf(r), r.y), short: defl(r.shortfall || 0, r.y) })).filter((r) => r.draw > 0 || r.short > 0);
    const totalDrawn = srcRows.reduce((s, r) => s + defl(drawOf(r), r.y), 0);
    const uncovered = srcRows.filter((r) => (r.shortfall || 0) > 0);
    const base = { uncoveredCount: uncovered.length, firstUncoveredYear: uncovered.length ? uncovered[0].year : null, totalDrawn };
    if (!drawRows.length) return { ...base, none: true, oneOffOnly: false };
    let peak = drawRows[0]; drawRows.forEach((r) => { if (r.draw > peak.draw) peak = r; });
    const sustained = drawRows.find((r, i) => drawRows[i + 1] && drawRows[i + 1].year === r.year + 1);
    if (!sustained) return { ...base, none: false, oneOffOnly: true, isolatedYears: drawRows.map((r) => r.year), peakDraw: peak.draw, peakYear: peak.year };
    const first = sustained;
    const next5 = srcRows.filter((r) => r.year >= first.year && r.year < first.year + 5);
    const avgDraw = next5.length ? next5.reduce((s, r) => s + defl(drawOf(r), r.y), 0) / next5.length : first.draw;
    return { ...base, none: false, oneOffOnly: false, firstYear: first.year, firstAge: first.c1Age, avgDraw, peakDraw: peak.draw, peakYear: peak.year };
  };

  const cashGap = useMemo(() => {
    const defl = (v, y) => (showReal ? v / Math.pow(1 + inflDec, y) : v);
    return computeCashGap(activeRows, defl);
  }, [activeRows, showReal, inflDec]);

  // Report always shows base-plan cash gap regardless of active scenario, since the report has its own stress page.
  const reportCashGap = useMemo(() => {
    const defl = (v, y) => (showReal ? v / Math.pow(1 + inflDec, y) : v);
    return computeCashGap(rows, defl);
  }, [rows, showReal, inflDec]);

  // Plan phases — classifies every year for the cash gap timeline strip.
  // Priority: short (red) > drawing (amber) > covered (green).
  // Follows the active scenario when one is live.
  const planPhases = useMemo(() => {
    if (!activeRows.length) return null;
    const phaseOf = (r) => ((r.shortfall || 0) > 0 ? "short" : (Math.max(0, (r.expenditure + (r.contrib || 0)) - r.income - (r.plannedDraw || 0) - (r.shortfall || 0))) > 0 ? "draw" : "ok");
    const segs = [];
    activeRows.forEach((r) => {
      const ph = phaseOf(r);
      const last = segs[segs.length - 1];
      if (last && last.phase === ph) { last.toYear = r.year; last.toAge = r.c1Age; last.n += 1; }
      else segs.push({ phase: ph, fromYear: r.year, toYear: r.year, fromAge: r.c1Age, toAge: r.c1Age, n: 1 });
    });
    return { segs, total: activeRows.length };
  }, [activeRows]);

  // Lifetime tax — total illustrative tax paid over the whole plan, in the current money basis.
  const lifetimeTax = useMemo(() => rows.reduce((s, r) => s + (showReal ? (r.taxPaid || 0) / Math.pow(1 + inflDec, r.y) : (r.taxPaid || 0)), 0), [rows, showReal, inflDec]);

  // Protection snapshot — cover in force per person + what pays at the first death in the base plan.
  const protSnap = useMemo(() => {
    if (!reportOpen || !protection.length) return null;
    const per = {};
    ["client1", "client2"].forEach((k) => {
      const pols = protection.filter((p) => p.insured === k);
      if (!pols.length) return;
      per[k] = { total: pols.reduce((s, p) => s + (Number(p.sumAssured) || 0), 0), prem: pols.reduce((s, p) => s + (Number(p.premium) || 0), 0), count: pols.length };
    });
    let firstDeath = null;
    if (couple && markers.firstDeath) {
      const dr = rows.find((r) => r.year === markers.firstDeath);
      const who = dr && !dr.aliveC1 ? "client1" : "client2";
      const age = who === "client1" ? ectx.lifeC1 : ectx.lifeC2;
      const paying = protection.filter((p) => (p.ptype || "life") !== "ci" && p.insured === who && (Number(p.coverToAge) || 0) > age);
      firstDeath = { who, year: markers.firstDeath, payout: paying.reduce((s, p) => s + (Number(p.sumAssured) || 0), 0) };
    }
    return { per, firstDeath };
  }, [reportOpen, protection, couple, markers.firstDeath, rows, ectx]);

  // ---- Retirement income goal -----------------------------------------------------------------
  // "I want £X/yr in retirement" → capital needed at a sustainable withdrawal rate, the gap vs the
  // plan's projected investable capital at retirement, and the monthly contribution that closes it.
  const RET_GOAL_KEY = "runway_ret_goal";
  const [retGoal, setRetGoal] = useState(() => {
    if (typeof window === "undefined") return { enabled: false, income: 60000, swr: 4 };
    try { return { enabled: false, income: 60000, swr: 4, ...(JSON.parse(localStorage.getItem(RET_GOAL_KEY) || "{}") || {}) }; } catch { return { enabled: false, income: 60000, swr: 4 }; }
  });
  const upRetGoal = (patch) => setRetGoal((g) => { const n = { ...g, ...patch }; try { localStorage.setItem(RET_GOAL_KEY, JSON.stringify(n)); } catch {} return n; });
  const retGoalCalc = useMemo(() => {
    if (!retGoal.enabled) return null;
    const target = Number(retGoal.income) || 0;
    const swr = Math.min(20, Math.max(0.5, Number(retGoal.swr) || 4)) / 100;
    if (target <= 0) return null;
    const requiredCapital = target / swr;
    // Plan's projected INVESTABLE capital at the first client's retirement, excludes property.
    // Deflated to today's money so it compares like-for-like with the target the client states
    // in today's terms (target ÷ SWR is a today's-money figure).
    const retYear = baseYear + Math.max(0, ectx.retC1 - ectx.age0c1);
    const retRow = rows.find((r) => r.c1Age === ectx.retC1) || rows.find((r) => r.year >= retYear);
    const yearsToRet = Math.max(0, ectx.retC1 - ectx.age0c1);
    const fAtRet = Math.pow(1 + inflDec, yearsToRet);
    const projInvestable = retRow ? Math.max(0, (retRow.total || 0) - (retRow.property || 0)) / fAtRet : 0;
    const projIncome = projInvestable * swr;
    const capitalGap = requiredCapital - projInvestable;
    const incomeGap = target - projIncome;
    const invAssets = assets.filter((a) => a.type === "investment" || a.type === "pension");
    const blended = invAssets.length ? invAssets.reduce((s, a) => s + (Number(a.growthRate) || 0), 0) / invAssets.length : (Number(assumptions.inflation) || 0) + 3;
    const realRate = Math.max(0, (blended - (Number(assumptions.inflation) || 0)) / 100); // real terms (figures are today's money)
    // Indicative longevity: drawing the target income from the projected pot, growing at the plan's blended real rate.
    // Pure annuity-style depletion — a sanity figure, not the full engine (which also has other income).
    let sustainable = false, yearsLast = null, depleteAge = null;
    if (projInvestable > 0 && target > 0) {
      if (target <= realRate * projInvestable + 1) sustainable = true;
      else if (realRate <= 0) yearsLast = Math.floor(projInvestable / target);
      else yearsLast = Math.floor(-Math.log(1 - (realRate * projInvestable) / target) / Math.log(1 + realRate));
      if (yearsLast != null) depleteAge = ectx.retC1 + Math.max(0, yearsLast);
    }
    // Monthly contribution (into a pot growing at the plan's blended return) to close the capital gap.
    let monthly = null;
    if (capitalGap > 0 && yearsToRet > 0) {
      const n = yearsToRet * 12, rM = realRate / 12;
      const fvFactor = rM > 0 ? (Math.pow(1 + rM, n) - 1) / rM : n;
      monthly = fvFactor > 0 ? capitalGap / fvFactor : null;
    }
    return { target, swr: swr * 100, requiredCapital, projInvestable, projIncome, capitalGap, incomeGap, onTrack: capitalGap <= 0, yearsToRet, monthly, sustainable, yearsLast, depleteAge };
  }, [retGoal, rows, ectx, baseYear, assets, assumptions.inflation, inflDec]);

  // ---- Protection gap analysis ----------------------------------------------------------------
  // Two layers: (1) rule-of-thumb benchmarks (house multipliers × current income), and
  // (2) the engine-driven survivor test — simulate death at a chosen age and solve for the
  // additional lump sum at death that keeps the survivor's plan funded. Observational output only.
  // Benchmark multipliers are a FIRM-LEVEL setting. When the host passes firmSettings (from Supabase),
  // that's the source of truth and changes flow up via onFirmSettingsChange so every adviser shares them.
  // Without a host (standalone/preview), it falls back to device localStorage so the feature still works.
  // CONTRACT: onFirmSettingsChange receives a PARTIAL patch (e.g. { protMult } or { riskRates }). The host
  // must MERGE it into the stored firm_settings row, not replace the whole row — otherwise updating one
  // setting would wipe the others.
  const PROT_MULT_KEY = "runway_prot_mult";
  const [protMult, setProtMult] = useState(() => {
    if (firmSettings && firmSettings.protMult) return { life: 10, ci: 3, ...firmSettings.protMult };
    if (typeof window === "undefined") return { life: 10, ci: 3 };
    try { return { life: 10, ci: 3, ...(JSON.parse(localStorage.getItem(PROT_MULT_KEY) || "{}") || {}) }; } catch { return { life: 10, ci: 3 }; }
  });
  // Keep in sync if the host pushes updated firm settings (e.g. another adviser changed them).
  useEffect(() => { if (firmSettings && firmSettings.protMult) setProtMult((m0) => ({ ...m0, ...firmSettings.protMult })); }, [firmSettings]);
  const upProtMult = (patch) => setProtMult((m0) => {
    const n = { ...m0, ...patch };
    if (onFirmSettingsChange) onFirmSettingsChange({ protMult: n });
    else { try { localStorage.setItem(PROT_MULT_KEY, JSON.stringify(n)); } catch {} }
    return n;
  });
  const [deathAges, setDeathAges] = useState({ client1: null, client2: null }); // null = default (current age + 1)
  const [survEss, setSurvEss] = useState({ client1: false, client2: false }); // survivor test: essentials-only spending mode per owner
  const protGap = useMemo(() => {
    if (section !== "protection" && !reportOpen) return null;
    // Current annual income per person; joint-owned income split 50/50.
    const annualNow = { client1: 0, client2: 0 };
    incomes.forEach((i) => {
      const o = i.owner || "client1";
      const sAge = resolveAge(i.start || { mode: "now" }, o === "joint" ? "client1" : o, ectx);
      const eAge = i.frequency === "oneoff" ? null : resolveAge(i.end || { mode: "end" }, o === "joint" ? "client1" : o, ectx);
      const refAge = o === "client2" ? ectx.age0c2 : ectx.age0c1;
      const active = i.frequency !== "oneoff" && i.frequency !== "everyN" && sAge <= refAge && (eAge === null || eAge > refAge);
      if (!active) return;
      const ann = (Number(i.amount) || 0) * (i.frequency === "monthly" ? 12 : 1);
      if (o === "joint") { annualNow.client1 += ann / 2; annualNow.client2 += ann / 2; }
      else annualNow[o] += ann;
    });
    const inForce = (k, ty) => protection.filter((p) => (p.insured || "client1") === k && (p.ptype || "life") === ty && (Number(p.coverToAge) || 0) > (k === "client2" ? ectx.age0c2 : ectx.age0c1)).reduce((s, p) => s + (Number(p.sumAssured) || 0), 0);
    const keys = couple ? ["client1", "client2"] : ["client1"];
    const bench = keys.map((k) => {
      const inc = annualNow[k];
      const lifeNeed = inc * (Number(protMult.life) || 0), ciNeed = inc * (Number(protMult.ci) || 0);
      const lifeHave = inForce(k, "life"), ciHave = inForce(k, "ci");
      return { k, inc, lifeNeed, ciNeed, lifeHave, ciHave, lifeGap: Math.max(0, lifeNeed - lifeHave), ciGap: Math.max(0, ciNeed - ciHave) };
    });
    // Survivor test — couples only; simulate death at the chosen age via a life-expectancy override.
    let survivor = null;
    if (couple) {
      const baseArgs = { profile, assumptions, assets, incomes, expenses, liabilities, protection, autoInvestSurplus: autoInvest };
      const deflTotal = (rs) => rs.reduce((s, r) => s + (r.shortfall || 0) / Math.pow(1 + inflDec, r.y), 0);
      survivor = ["client1", "client2"].map((k) => {
        const age0 = k === "client2" ? ectx.age0c2 : ectx.age0c1;
        const lifeExp = k === "client2" ? ectx.lifeC2 : ectx.lifeC1;
        const minAge = age0 + 1, maxAge = Math.max(minAge, lifeExp - 1);
        const dAge = Math.min(maxAge, Math.max(minAge, Number(deathAges[k]) || minAge));
        const prof2 = { ...profile, [k]: { ...profile[k], lifeExpectancy: dAge } };
        const run = (extra) => projectCashflow({ ...baseArgs, profile: prof2, lumpSums: extra > 0 ? [{ year: dAge + 1 - age0, amount: extra }] : [] });
        const rs = run(0);
        const shortRows = rs.filter((r) => (r.shortfall || 0) > 0);
        const funded = shortRows.length === 0;
        const firstShortYear = funded ? null : shortRows[0].year;
        const totalShortReal = funded ? 0 : deflTotal(rs);
        const payout = protection.filter((p) => (p.ptype || "life") !== "ci" && (p.insured || "client1") === k && (Number(p.coverToAge) || 0) > dAge).reduce((s, p) => s + (Number(p.sumAssured) || 0), 0);
        let closeGap = null;
        if (!funded) {
          let lo = 0, hi = 20000000;
          if (run(hi).some((r) => r.shortfall > 0)) closeGap = Infinity;
          else { for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (run(mid).some((r) => r.shortfall > 0)) lo = mid; else hi = mid; } closeGap = hi; }
        }
        // Essentials-only floor — re-run dropping discretionary spend. This gives a need-range:
        // what the survivor MUST be able to cover (essentials) vs what the full planned lifestyle costs.
        // The difference tells the adviser how much of any gap is discretionary (trimmable) vs hard.
        const hasDisc = expenses.some((e) => e.priority === "discretionary");
        let essFunded = funded, essFirstShortYear = firstShortYear, essTotalShortReal = totalShortReal, essCloseGap = closeGap;
        if (hasDisc) {
          const essExpenses = expenses.filter((e) => (e.priority || "essential") !== "discretionary");
          const runEss = (extra) => projectCashflow({ ...baseArgs, profile: prof2, expenses: essExpenses, lumpSums: extra > 0 ? [{ year: dAge + 1 - age0, amount: extra }] : [] });
          const rsEss = runEss(0);
          const essShort = rsEss.filter((r) => (r.shortfall || 0) > 0);
          essFunded = essShort.length === 0;
          essFirstShortYear = essFunded ? null : essShort[0].year;
          essTotalShortReal = essFunded ? 0 : deflTotal(rsEss);
          essCloseGap = null;
          if (!essFunded && survEss[k]) {
            let lo = 0, hi = 20000000;
            if (runEss(hi).some((r) => r.shortfall > 0)) essCloseGap = Infinity;
            else { for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (runEss(mid).some((r) => r.shortfall > 0)) lo = mid; else hi = mid; } essCloseGap = hi; }
          }
        }
        return { k, dAge, minAge, maxAge, hasDisc, funded, firstShortYear, totalShortReal, payout, closeGap, essFunded, essFirstShortYear, essTotalShortReal, essCloseGap };
      });
    }
    return { bench, survivor, annualNow };
  }, [section, reportOpen, incomes, protection, couple, profile, assumptions, assets, expenses, liabilities, ectx, inflDec, protMult, deathAges, survEss]);

  // Deterministic commentary engine — observational language only, every number from the engine.
  const generatedCommentary = useMemo(() => {
    if (!reportOpen) return "";
    const m = (v) => fmtFull(v, cur);
    const anon = reportCfg.anonymous;
    const n1 = anon ? "Client 1" : fn1, n2 = anon ? "Client 2" : fn2;
    const y0 = rows[0] || {};
    const surplus0 = (y0.income || 0) - (y0.expenditure || 0);
    const paras = [];
    // Funding verdict + trajectory
    if (kpis.depletionAge === null) {
      paras.push(`Based on the assumptions in this report, the plan is fully funded: spendable assets last to the end of the plan in ${kpis.endYear}, with a projected ${m(kpis.endVal)} of net worth remaining. Net worth peaks at approximately ${m(kpis.peak)}.`);
    } else {
      paras.push(`Based on the assumptions in this report, spendable assets are projected to run short around ${kpis.depYear}${kpis.depName ? ` (${anon ? (kpis.depName === fn1 ? "Client 1" : "Client 2") : kpis.depName} aged ${kpis.depletionAge})` : ` (age ${kpis.depletionAge})`}. The figures below show the scale of the gap and the levers that influence it.`);
    }
    if (reportCashGap && !reportCashGap.none && !reportCashGap.oneOffOnly) {
      paras.push(`Income currently ${surplus0 >= 0 ? `exceeds spending by about ${m(surplus0)} a year` : `falls short of spending by about ${m(-surplus0)} a year`}. From ${reportCashGap.firstYear}, spending begins to exceed income on a sustained basis and roughly ${m(reportCashGap.avgDraw)} a year is drawn from savings and investments, peaking at ${m(reportCashGap.peakDraw)} in ${reportCashGap.peakYear}.`);
    } else if (reportCashGap && reportCashGap.oneOffOnly) {
      paras.push(`Income covers regular spending in every year of the plan. Savings are drawn on only for one-off costs (${reportCashGap.isolatedYears.join(", ")}), the largest being ${m(reportCashGap.peakDraw)} in ${reportCashGap.peakYear}.`);
    } else if (reportCashGap && reportCashGap.none) {
      paras.push(`Income covers spending in every year of the plan — savings are never drawn upon under the current assumptions.`);
    }
    // Strengths
    const strengths = [];
    if (kpis.depletionAge === null) strengths.push("the plan remains funded across the full time horizon, including the survivor period" );
    if (surplus0 > 0) strengths.push(`a current annual surplus of about ${m(surplus0)} while working`);
    if (hasContrib) strengths.push("regular contributions are being made to savings or pensions");
    const types = new Set(assets.map((a) => a.type));
    if (types.size >= 3) strengths.push("assets are spread across several classes (" + [...types].map((t2) => TYPE_LABEL[t2].toLowerCase()).join(", ") + ")");
    if (protection.length) strengths.push("life cover is in force");
    if (kpis.depletionAge === null && kpis.endVal > 0) strengths.push(`a projected estate of ${m(kpis.endVal)} at the end of the plan`);
    if (strengths.length) paras.push("Strengths: " + strengths.join("; ") + ".");
    // Watch points
    const watch = [];
    if (kpis.depletionAge !== null) watch.push(`assets are projected to deplete at age ${kpis.depletionAge} (${kpis.depYear})`);
    const gross = assets.reduce((s, a) => s + (Number(a.value) || 0), 0);
    const propVal = assets.filter((a) => a.type === "property").reduce((s, a) => s + (Number(a.value) || 0), 0);
    if (gross > 0 && propVal / gross > 0.5) watch.push(`over half of total assets (${Math.round((propVal / gross) * 100)}%) is held in property, which the plan treats as non-spendable`);
    if (!protection.length && (couple || liabilities.length > 0)) watch.push("no life cover is currently recorded" + (liabilities.length ? " while liabilities are outstanding" : ""));
    if (couple && protSnap && protSnap.firstDeath && protSnap.firstDeath.payout === 0 && protection.length) watch.push(`the cover recorded does not extend to the first death in ${protSnap.firstDeath.year} (terms end earlier)`);
    if (protGap) protGap.bench.forEach((b) => { const nm = b.k === "client2" ? n2 : n1; if (b.inc > 0 && b.lifeGap > 0) watch.push(`life cover for ${nm} is ${m(b.lifeGap)} below the ${protMult.life}× income benchmark`); if (b.inc > 0 && b.ciGap > 0 && b.ciHave === 0) watch.push(`no critical-illness cover is recorded for ${nm} (benchmark ${m(b.ciNeed)})`); });
    if (protGap && protGap.survivor) protGap.survivor.forEach((sv) => { const nm = sv.k === "client2" ? n2 : n1; if (!sv.funded && sv.closeGap != null) watch.push(`if ${nm} died at age ${sv.dAge}, the survivor's plan runs short — additional cover of ${sv.closeGap === Infinity ? "over " + m(20000000) : "~" + m(Math.ceil(sv.closeGap / 10000) * 10000)} would close the gap`); });
    if (reportCashGap && !reportCashGap.none && reportCashGap.uncoveredCount > 0) watch.push(`${reportCashGap.uncoveredCount} year${reportCashGap.uncoveredCount === 1 ? "" : "s"} show spending that cannot be met from income or savings, starting ${reportCashGap.firstUncoveredYear}`);
    const incOwners = new Set(incomes.filter((i) => (Number(i.amount) || 0) > 0).map((i) => i.owner || "client1"));
    if (couple && incOwners.size === 1 && incomes.length > 0) watch.push(`all recorded income belongs to ${incOwners.has("client2") ? n2 : n1}`);
    if (watch.length) paras.push("Watch points: " + watch.join("; ") + ".");
    if (lifetimeTax > 0) paras.push(`Illustrative tax over the life of the plan totals ${m(lifetimeTax)}, based on the residence timeline and rates entered.`);
    // Stress result — a factual one-liner so the commentary and the stress page agree.
    if (stressActive && stressImpact) {
      const sName = stressImpact.label;
      if (!stressImpact.stressAge) paras.push(`Under the stress scenario tested (${sName}), the plan is projected to remain funded to the end of the projection.`);
      else if (stressImpact.baseAge) paras.push(`Under the stress scenario tested (${sName}), the projected point at which spendable assets run short moves from age ${stressImpact.baseAge} to age ${stressImpact.stressAge}.`);
      else paras.push(`Under the stress scenario tested (${sName}), spendable assets are projected to run short at age ${stressImpact.stressAge}, where the base plan funds for life.`);
    }
    paras.push(`All figures are ${showReal ? "in today's money (adjusted for inflation)" : "in future money (not adjusted for inflation)"} and reflect the assumptions listed in this report.${stressActive ? " The figures above describe the base plan; the stress scenario is illustrated on its own page." : ""} This commentary describes the projection — it is not a recommendation.`);
    return paras.join("\n\n");
  }, [reportOpen, reportCfg.anonymous, rows, kpis, reportCashGap, protSnap, protGap, protMult, assets, incomes, liabilities, protection, hasContrib, couple, fn1, fn2, cur, showReal, stressActive, stressImpact, lifetimeTax]);
  const commentaryText = commentaryEdit ?? generatedCommentary;

  // What-if goal solver. Synchronous and memoised: it only runs when the panel or report is open
  // (the gate below), computes in one pass, and the panel opens instantly with answers — the smooth,
  // immediate behaviour. (An earlier attempt to defer this with useTransition could be starved and
  // never commit; synchronous is both simpler and faster for this one-shot-on-open computation.)
  const goal = useMemo(() => {
    if (!goalOpen && !reportOpen) return null;
    const funded = (inp) => !projectCashflow(inp).some((r) => r.shortfall > 0);
    const base = { profile, assumptions, assets, incomes, expenses, liabilities, protection };
    const fundedNow = funded(base);
    // --- Margin of safety -------------------------------------------------------------------
    // Everyday affordability answers (spend / retire / new monthly cost, and the fixes when a plan
    // falls short) are reported with a built-in cushion, not at break-even: the plan must still fund
    // even if every asset returned 1 point less than assumed. Stops the solvers handing back knife-edge
    // figures. The one-off purchase card keeps its stricter 2pt + live-to-100 cushion (stressLiquid);
    // longevity has its own card. Returns/inflation headroom cards stay at break-even — they ARE the
    // resilience measure, so a cushion would double-count.
    const cushion = (inp) => ({ ...inp, assets: inp.assets.map((a) => ({ ...a, growthRate: (Number(a.growthRate) || 0) - 1 })) });
    const fundedSafe = (inp) => funded(cushion(inp));
    const fundedSafeNow = fundedSafe(base);
    const retYearOff = Math.max(0, Math.max(ectx.retC1 - ectx.age0c1, (couple ? ectx.retC2 - ectx.age0c2 : 0)) + 1);
    const spendAtYear = (off) => {
      const infl = (Number(assumptions.inflation) || 0) / 100;
      return expenses.reduce((s, e) => {
        const amt = Number(e.amount) || 0; if (!amt) return s;
        const planAge1 = ectx.age0c1 + off;
        const start = e.start || {}; const end = e.end || {};
        const startAge = start.mode === "now" ? ectx.age0c1 : start.mode === "retirement" ? ectx.retC1 : Number(start.age) || 0;
        const endAge = end.mode === "end" ? 999 : end.mode === "retirement" ? ectx.retC1 : end.mode === "now" ? ectx.age0c1 : Number(end.age) || 999;
        if (planAge1 < startAge || planAge1 >= endAge) return s;
        const esc = e.escalation === "none" ? 0 : e.escalation === "custom" ? (Number(e.customEsc) || 0) / 100 : infl;
        const scaled = amt * Math.pow(1 + esc, off);
        if (e.frequency === "monthly") return s + scaled * 12;
        if (e.frequency === "annual") return s + scaled;
        return s;
      }, 0);
    };
    // curSpend (and therefore maxSpend = curSpend × multiplier) must be in TODAY'S money to match the
    // card's "in today's money" label. spendAtYear returns the nominal, inflation-escalated spend at the
    // offset, so deflate by inflation over that offset to recover the real value. Without this the card
    // reported a future-money figure (~48% higher over a 16-year offset) while calling it today's money.
    const realSpendAtYear = (off) => spendAtYear(off) / Math.pow(1 + (Number(assumptions.inflation) || 0) / 100, off);
    const curSpend = realSpendAtYear(retYearOff) || realSpendAtYear(0);
    const baseInflPct = Number(assumptions.inflation) || 0;
    const estateAtEnd = (inp) => { const rr = projectCashflow(inp); if (!rr.length) return 0; const ly = rr.length - 1; return Math.max(0, (rr[ly].total - (rr[ly].debt || 0))) / Math.pow(1 + baseInflPct / 100, ly); };

    // Growth solver
    const gTest = (g) => funded({ ...base, assets: assets.map((a) => ({ ...a, growthRate: (Number(a.growthRate) || 0) + g })) });
    let growth = null, growthCapped = false;
    if (fundedNow) { if (gTest(-12)) { growth = -12; growthCapped = true; } else { let a = -12, b = 0; for (let i = 0; i < 28; i++) { const m = (a + b) / 2; if (gTest(m)) b = m; else a = m; } growth = b; } }
    else if (gTest(25)) { let a = 0, b = 25; for (let i = 0; i < 28; i++) { const m = (a + b) / 2; if (gTest(m)) b = m; else a = m; } growth = b; }

    // Retirement solver — shift only clients who haven't retired yet (Session C accuracy fix).
    const ret1Base = Number(profile.client1.retirementAge) || 0;
    const ret2Base = Number((profile.client2 || {}).retirementAge) || 0;
    const ageNow1 = deriveAge(profile.client1.dob);
    const ageNow2 = couple ? deriveAge((profile.client2 || {}).dob) : null;
    const c1Working = ageNow1 < ret1Base;
    const c2Working = couple && ageNow2 != null && ageNow2 < ret2Base;
    const rPlan = (d) => {
      const p1 = c1Working ? { ...profile.client1, retirementAge: ret1Base + d } : profile.client1;
      const p2 = couple && c2Working ? { ...profile.client2, retirementAge: ret2Base + d } : (profile.client2 || {});
      return { ...base, profile: { ...profile, client1: p1, ...(couple ? { client2: p2 } : {}) } };
    };
    const rTest = (d) => funded(rPlan(d));
    const rTestSafe = (d) => fundedSafe(rPlan(d));
    let retire = null;
    if (!c1Working && !c2Working) { retire = 0; }
    else if (fundedNow) { let d = 0; const floor = Math.max(-25, ageNow1 - ret1Base); while (d > floor && rTest(d - 1)) d--; retire = d; }
    else { let d = 1; while (d <= 25 && !rTest(d)) d++; retire = d <= 25 ? d : null; }
    const earliestRetAge = retire != null ? ret1Base + retire : null;
    let retireMargin = null;
    if (fundedNow && retire != null && retire !== 0) {
      const p1m = c1Working ? { ...profile.client1, retirementAge: ret1Base + retire } : profile.client1;
      const p2m = couple && c2Working ? { ...profile.client2, retirementAge: ret2Base + retire } : (profile.client2 || {});
      retireMargin = estateAtEnd({ ...base, profile: { ...profile, client1: p1m, ...(couple ? { client2: p2m } : {}) } });
    }
    // Cushioned retirement: earliest age that holds with the 1-point return cushion (>= break-even age).
    let retireSafe = null;
    if (!c1Working && !c2Working) { retireSafe = 0; }
    else if (fundedSafeNow) { let d = 0; const floor = Math.max(-25, ageNow1 - ret1Base); while (d > floor && rTestSafe(d - 1)) d--; retireSafe = d; }
    else { let d = 1; while (d <= 25 && !rTestSafe(d)) d++; retireSafe = d <= 25 ? d : null; }
    const earliestRetAgeSafe = retireSafe != null ? ret1Base + retireSafe : null;

    // Spending solver — only scale recurring lifestyle expenses, not one-offs (Session C accuracy fix).
    const recurringExp = expenses.filter((e) => e.frequency === "annual" || e.frequency === "monthly");
    const oneOffExp = expenses.filter((e) => e.frequency !== "annual" && e.frequency !== "monthly");
    const sTest = (f) => funded({ ...base, expenses: [...recurringExp.map((e) => ({ ...e, amount: (Number(e.amount) || 0) * f })), ...oneOffExp] });
    let spend = null;
    if (fundedNow) { if (sTest(5)) spend = 5; else { let a = 1, b = 5; for (let i = 0; i < 26; i++) { const m = (a + b) / 2; if (sTest(m)) a = m; else b = m; } spend = a; } }
    else if (sTest(0.1)) { let a = 0.1, b = 1; for (let i = 0; i < 26; i++) { const m = (a + b) / 2; if (sTest(m)) a = m; else b = m; } spend = a; }
    const maxSpend = spend != null && curSpend > 0 ? curSpend * spend : null;
    // Cushioned spend multiplier across the full range (can sit below 1 if a cushion needs lower spend).
    const sTestSafe = (f) => fundedSafe({ ...base, expenses: [...recurringExp.map((e) => ({ ...e, amount: (Number(e.amount) || 0) * f })), ...oneOffExp] });
    let spendSafe = null;
    if (sTestSafe(5)) spendSafe = 5;
    else if (sTestSafe(0.1)) { let a = 0.1, b = 5; for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (sTestSafe(m)) a = m; else b = m; } spendSafe = a; }
    const maxSpendSafe = spendSafe != null && curSpend > 0 ? curSpend * spendSafe : null;

    const tmpExp = (extra) => ({ ...base, expenses: [...expenses, extra] });

    // One-off purchase solver
    const liquidPool = assets.filter((a) => (a.type === "cash" || a.type === "investment") && a.drawdown).map((a) => ({ id: a.id, type: a.type, value: Math.max(0, Number(a.value) || 0) }));
    const liquidToday = liquidPool.reduce((s, a) => s + a.value, 0);
    const spendLiquid = (L) => { let rem = L; const cut = {}; for (const a of [...liquidPool].sort((x, y) => (x.type === "cash" ? 0 : 1) - (y.type === "cash" ? 0 : 1))) { const take = Math.min(a.value, rem); cut[a.id] = take; rem -= take; if (rem <= 0) break; } return { ...base, assets: assets.map((a) => (cut[a.id] ? { ...a, value: (Number(a.value) || 0) - cut[a.id] } : a)) }; };
    const stressLiquid = (b) => ({ ...b, assets: b.assets.map((a) => ({ ...a, growthRate: (Number(a.growthRate) || 0) - 2 })), profile: { ...b.profile, client1: { ...b.profile.client1, lifeExpectancy: Math.max(100, Number(b.profile.client1.lifeExpectancy) || 0) }, client2: { ...b.profile.client2, lifeExpectancy: Math.max(100, Number(b.profile.client2.lifeExpectancy) || 0) } } });
    const solveLiquid = (test) => { if (liquidToday <= 0 || !test(0)) return 0; if (test(liquidToday)) return liquidToday; let lo = 0, hi = liquidToday; for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (test(mid)) lo = mid; else hi = mid; } return lo; };
    let oneOff = null;
    if (fundedNow) { const maxL = solveLiquid((L) => funded(spendLiquid(L))); const safeL = solveLiquid((L) => funded(stressLiquid(spendLiquid(L)))); const aft = projectCashflow(spendLiquid(safeL)); const lastY = Math.max(0, aft.length - 1); const fAft = Math.pow(1 + baseInflPct / 100, lastY); const estateAfter = aft.length ? Math.max(0, (aft[lastY].total - (aft[lastY].debt || 0))) / fAft : 0; oneOff = { liquidToday, safe: safeL, max: maxL, leftover: Math.max(0, liquidToday - safeL), estateAfter }; }

    // Monthly commitment solver
    const mTest = (mo) => funded(tmpExp({ id: "tmp_m", name: "monthly", amount: mo, frequency: "monthly", escalation: "inflation", customEsc: 0, everyYears: 1, start: { mode: "now" }, end: { mode: "end" }, priority: "discretionary", owner: "joint" }));
    let maxMonthly = null;
    if (fundedNow) { let a = 0, b = 50000; if (mTest(b)) maxMonthly = b; else { for (let i = 0; i < 28; i++) { const m = (a + b) / 2; if (mTest(m)) a = m; else b = m; } maxMonthly = a; } }
    const mTestSafe = (mo) => fundedSafe(tmpExp({ id: "tmp_m", name: "monthly", amount: mo, frequency: "monthly", escalation: "inflation", customEsc: 0, everyYears: 1, start: { mode: "now" }, end: { mode: "end" }, priority: "discretionary", owner: "joint" }));
    let maxMonthlySafe = null;
    if (fundedNow) { let a = 0, b = 50000; if (mTestSafe(b)) maxMonthlySafe = b; else { for (let i = 0; i < 28; i++) { const m = (a + b) / 2; if (mTestSafe(m)) a = m; else b = m; } maxMonthlySafe = a; } }

    // Resilience + Inflation + Property
    const to100 = funded({ ...base, profile: { ...profile, client1: { ...profile.client1, lifeExpectancy: Math.max(100, Number(profile.client1.lifeExpectancy) || 0) }, client2: { ...profile.client2, lifeExpectancy: Math.max(100, Number(profile.client2.lifeExpectancy) || 0) } } });
    const baseInfl = Number(assumptions.inflation) || 0;
    const iTest = (extra) => funded({ ...base, assumptions: { ...assumptions, inflation: baseInfl + extra } });
    let inflMax = null, inflCapped = false;
    if (fundedNow) { if (iTest(10)) { inflMax = 10; inflCapped = true; } else { let a = 0, b = 10; for (let i = 0; i < 26; i++) { const m = (a + b) / 2; if (iTest(m)) a = m; else b = m; } inflMax = a; } }
    const propVal = assets.filter((a) => a.type === "property").reduce((s, a) => s + (Number(a.value) || 0), 0);
    let propRelease = null;
    if (propVal > 0) { const invRates = assets.filter((a) => a.type === "investment").map((a) => Number(a.growthRate) || 0); const fbRates = assets.filter((a) => a.type === "investment" || a.type === "pension").map((a) => Number(a.growthRate) || 0); const investReturn = invRates.length ? invRates.reduce((s, r) => s + r, 0) / invRates.length : fbRates.length ? fbRates.reduce((s, r) => s + r, 0) / fbRates.length : (Number(assumptions.inflation) || 0) + 3; const released = assets.map((a) => (a.type === "property" ? { ...a, type: "investment", drawdown: true, growthRate: investReturn } : a)); const rRows = projectCashflow({ ...base, assets: released }); const rDep = rRows.find((r) => r.shortfall > 0); const lastY = Math.max(0, rRows.length - 1); const fAft = Math.pow(1 + baseInfl / 100, lastY); const rEstate = rRows.length ? Math.max(0, (rRows[lastY].total - (rRows[lastY].debt || 0))) / fAft : 0; const depAge = rDep ? (couple && !rDep.aliveC1 && rDep.aliveC2 ? rDep.c2Age : rDep.c1Age) : null; propRelease = { propVal, nowFunded: !rDep, depAge, estate: rEstate }; }

    // Stop-saving: the regular (recurring) contributions currently being paid in, and whether the
    // plan still funds with them switched off from today. Single-lever — spending, retirement age
    // and income are left untouched.
    const isRecurringContrib = (c) => !!(c && c.enabled && (c.frequency === "monthly" || c.frequency === "annual") && (Number(c.amount) || 0) > 0);
    const contribAnnual = (c) => isRecurringContrib(c) ? (c.frequency === "monthly" ? (Number(c.amount) || 0) * 12 : (Number(c.amount) || 0)) : 0;
    const totalContrib = assets.reduce((s, a) => s + contribAnnual(a.contribution), 0);
    let stopSaving = null;
    if (fundedNow && totalContrib > 0) {
      const noSave = { ...base, assets: assets.map((a) => (isRecurringContrib(a.contribution) ? { ...a, contribution: { ...a.contribution, enabled: false } } : a)) };
      stopSaving = { total: totalContrib, funded: funded(noSave), safe: fundedSafe(noSave) };
    }

    return { fundedNow, fundedSafeNow, growth, growthCapped, retire, retireMargin, earliestRetAge, retireSafe, earliestRetAgeSafe, spend, maxSpend, spendSafe, maxSpendSafe, curSpend, oneOff, maxMonthly, maxMonthlySafe, stopSaving, to100, baseInfl, inflMax, inflCapped, propRelease, estateEnd: kpis.endVal, estateEndYear: kpis.endYear };
  }, [goalOpen, reportOpen, profile, assumptions, assets, incomes, expenses, liabilities, protection, rows, kpis, ectx, couple]);

  const patch = (setter) => (id, p) => setter((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const rmFn = (setter) => (id) => { setter((prev) => prev.filter((x) => x.id !== id)); setOpen((s) => { const n = new Set(s); n.delete(id); return n; }); };
  const upAsset = patch(setAssets), rmAsset = rmFn(setAssets);
  const upInc = patch(setIncomes), rmInc = rmFn(setIncomes);
  const upExp = patch(setExpenses), rmExp = rmFn(setExpenses);
  const upLiab = patch(setLiabilities), rmLiab = rmFn(setLiabilities);
  const clearAssets = () => { setAssets([]); setOpen(new Set()); };
  const clearIncomes = () => { setIncomes([]); setOpen(new Set()); };
  const clearExpenses = () => { setExpenses([]); setOpen(new Set()); };
  const clearLiabilities = () => { setLiabilities([]); setOpen(new Set()); };
  const clearProtection = () => { setProtection([]); setOpen(new Set()); };
  const addLiab = () => addOpen(setLiabilities, { id: uid(), name: "New liability", type: "mortgage", balance: 0, rate: 4, monthlyPayment: 0, owner: couple ? "joint" : "client1" }, liabilities);
  const upPol = patch(setProtection), rmPol = rmFn(setProtection);
  const addPol = () => addOpen(setProtection, { id: uid(), name: "New policy", insured: "client1", sumAssured: 250000, premium: 50, coverToAge: 90 }, protection);
  const upContrib = (id, p) => setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, contribution: { ...a.contribution, ...p } } : a)));
  const upWithdrawal = (id, p) => setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, withdrawal: { ...(a.withdrawal || withdrawalDefault()), ...p } } : a)));
  const upClient = (which, p) => setProfile((prev) => ({ ...prev, [which]: { ...prev[which], ...p } }));
  const addAnnotation = () => setAnnotations((a) => [...a, { id: uid(), year: baseYear + 5, text: "" }]);
  const upAnnotation = (id, p) => setAnnotations((a) => a.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const rmAnnotation = (id) => setAnnotations((a) => a.filter((x) => x.id !== id));

  const tax = assumptions.tax || taxDefault();
  const est = tax.estate || { enabled: false, nrb: 0, rnrb: 0, rate: 40, transferableNrb: true };
  const setTax = (p) => setAssumptions((a) => ({ ...a, tax: { ...(a.tax || taxDefault()), ...p } }));
  const setEstate = (p) => setTax({ estate: { ...est, ...p } });
  const upPeriod = (id, p) => setTax({ periods: tax.periods.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  const addPeriod = () => setTax({ periods: [...tax.periods, { id: uid(), label: "New jurisdiction", startMode: "age", startAge: Math.max(ectx.age0c1 + 1, 65), personalAllowance: 0, bands: [{ upTo: "", rate: 0 }], cgtRate: 0 }] });
  const rmPeriod = (id) => setTax({ periods: tax.periods.filter((x) => x.id !== id) });
  const applyPreset = (id, key) => upPeriod(id, { personalAllowance: TAX_PRESETS[key].personalAllowance, bands: TAX_PRESETS[key].bands.map((b) => ({ ...b })), cgtRate: TAX_PRESETS[key].cgtRate });
  const upBand = (pid, idx, patch) => { const p = tax.periods.find((x) => x.id === pid); if (patch.rate != null) patch = { ...patch, rate: Math.min(99, Math.max(0, Number(patch.rate) || 0)) }; upPeriod(pid, { bands: p.bands.map((b, i) => (i === idx ? { ...b, ...patch } : b)) }); };
  const addBand = (pid) => { const p = tax.periods.find((x) => x.id === pid); upPeriod(pid, { bands: [...p.bands, { upTo: "", rate: 0 }] }); };
  const rmBand = (pid, idx) => { const p = tax.periods.find((x) => x.id === pid); upPeriod(pid, { bands: p.bands.filter((_, i) => i !== idx) }); };
  const toggleOpen = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // Accordion behaviour: opening a row collapses its siblings, so the section never stacks up.
  // Closing just closes. Expand All still opens everything for side-by-side work.
  const openSolo = (id, siblings) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(id)) { n.delete(id); return n; }
    (siblings || []).forEach((x) => n.delete(x.id));
    n.add(id);
    return n;
  });
  const expandAll = (items) => setOpen((s) => { const n = new Set(s); items.forEach((x) => n.add(x.id)); return n; });
  const collapseAll = (items) => setOpen((s) => { const n = new Set(s); items.forEach((x) => n.delete(x.id)); return n; });

  // ---- Risk profiles (per client) -------------------------------------------------------------
  // Selecting a profile applies its per-type growth rates to the assets that person owns.
  // Risk template rates are a FIRM-LEVEL setting (the house view of what "Balanced" etc. returns).
  // firmSettings is the source of truth when present (Supabase via the host), localStorage otherwise.
  // Apply + drift both use the effective rates (shipped defaults merged with any overrides).
  const RISK_RATES_KEY = "runway_risk_rates";
  const [riskRateOverrides, setRiskRateOverrides] = useState(() => {
    if (firmSettings && firmSettings.riskRates) return firmSettings.riskRates;
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem(RISK_RATES_KEY) || "{}") || {}; } catch { return {}; }
  });
  useEffect(() => { if (firmSettings && firmSettings.riskRates) setRiskRateOverrides(firmSettings.riskRates); }, [firmSettings]);
  const [riskEditOpen, setRiskEditOpen] = useState(false);
  const getRiskRates = (id) => { const p = riskProfileById(id); return p ? { ...p.rates, ...(riskRateOverrides[id] || {}) } : null; };
  const persistRiskRates = (n) => { if (onFirmSettingsChange) onFirmSettingsChange({ riskRates: n }); else { try { localStorage.setItem(RISK_RATES_KEY, JSON.stringify(n)); } catch {} } };
  const setRiskRate = (id, type, v) => setRiskRateOverrides((o) => { const n = { ...o, [id]: { ...(o[id] || {}), [type]: Number(v) } }; persistRiskRates(n); return n; });
  const resetRiskRates = () => { setRiskRateOverrides({}); if (onFirmSettingsChange) onFirmSettingsChange({ riskRates: {} }); else { try { localStorage.removeItem(RISK_RATES_KEY); } catch {} } };
  const riskRatesCustomised = Object.keys(riskRateOverrides).length > 0;
  const riskProfiles = assumptions.riskProfiles || {};
  const applyRiskProfile = (ownerKey, profileId) => {
    const rates = getRiskRates(profileId);
    setAssumptions((a) => ({ ...a, riskProfiles: { ...(a.riskProfiles || {}), [ownerKey]: profileId || null } }));
    if (!rates) return; // "custom" / cleared — keep current rates
    setAssets((prev) => prev.map((as) => ((as.owner || "client1") === ownerKey && rates[as.type] != null ? { ...as, growthRate: rates[as.type] } : as)));
  };
  const riskDrift = useMemo(() => {
    const drift = {};
    ["client1", "client2", "joint"].forEach((k) => {
      const rates = getRiskRates(riskProfiles[k]);
      if (!rates) return;
      drift[k] = assets.some((as) => (as.owner || "client1") === k && rates[as.type] != null && Number(as.growthRate) !== rates[as.type]);
    });
    return drift;
  }, [assets, riskProfiles, riskRateOverrides]); // eslint-disable-line react-hooks/exhaustive-deps
  const riskOwnerKeys = couple ? ["client1", "client2", "joint"] : ["client1"];
  const riskOwnerLabel = (k) => (k === "joint" ? "Joint assets" : (profile[k].name || (k === "client1" ? "Client 1" : "Client 2")));
  const addOpen = (setter, rec, siblings) => {
    setter((p) => [rec, ...p]);
    setOpen((s) => { const n = new Set(s); (siblings || []).forEach((x) => n.delete(x.id)); n.add(rec.id); return n; });
    // bring the new record into view once it has rendered
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const ed = document.querySelector(".editor");
      if (ed) ed.scrollTo({ top: ed.scrollHeight, behavior: "smooth" });
    }));
  };
  const addAsset = () => addOpen(setAssets, { id: uid(), name: "New asset", type: "investment", value: 0, growthRate: 5, drawdown: true, owner: couple ? "joint" : "client1", contribution: contribDefault() }, assets);
  const addInc = () => addOpen(setIncomes, { id: uid(), name: "New income", amount: 0, frequency: "annual", escalation: "none", customEsc: 0, everyYears: 1, start: { mode: "now" }, end: { mode: "end" }, owner: "client1", onDeath: deathDefault() }, incomes);
  const addExp = () => addOpen(setExpenses, { id: uid(), name: "New expense", amount: 0, frequency: "annual", escalation: "inflation", customEsc: 0, everyYears: 1, start: { mode: "now" }, end: { mode: "end" }, priority: "essential", owner: "joint" }, expenses);

  const chartMargin = { top: 8, right: 14, left: 2, bottom: 0 };
  const axisWidth = 54;
  const tick = { fill: t.low, fontSize: 11, fontFamily: "Manrope, sans-serif" };
  const xInterval = Math.max(0, Math.floor(data.length / 8));
  const agesLabel = (d) => {
    if (!couple) return `Age ${d.c1Age}`;
    const a = d.aliveC1 ? `${fn1} ${d.c1Age}` : `${fn1} (deceased)`;
    const b = d.aliveC2 ? `${fn2} ${d.c2Age}` : `${fn2} (deceased)`;
    return `${a} · ${b}`;
  };

  // Tooltips use Recharts' native <Tooltip> with custom content (CompTip/FlowTip). Recharts handles
  // hover detection and positioning internally — this is what keeps chart scanning buttery smooth.

  const CompTip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const d = payload[0].payload;
    const yearPayouts = payoutEvents.filter((e) => e.year === d.year);
    const stressed = d.stressed != null; // a scenario (crash / CI / survivor) is active
    const av = (a) => (stressed ? (d["s_" + aKey(a.id)] || 0) : (d[aKey(a.id)] || 0));
    const sNet = stressed ? (d.sTotal - (d.sDebt || 0)) : d.netWorth;
    const delta = stressed ? sNet - d.netWorth : 0;
    return (
      <div className="tip">
        <div className="tip-head"><b className="num">{d.year}</b> <span className="tip-yr">{agesLabel(d)}</span></div>
        <div className="tip-total"><span>Net worth{stressed ? " (current plan)" : ""}</span><b className="num">{fmtFull(d.total, cur)}</b></div>
        {stressed && <div className="tip-total tip-stress"><span>Under the scenario</span><b className="num">{fmtFull(d.sTotal, cur)}</b></div>}
        {stressed && Math.abs(delta) >= 1 && <div className="tip-row tip-stress-delta"><span className="tip-name">{survivorOverlay ? "vs both alive" : "Impact"}</span><span className="num">{delta < 0 ? "−" : "+"}{fmtFull(Math.abs(delta), cur)}</span></div>}
        <div className="tip-rule" />
        {stressed && <div className="tip-bd-label">Assets under the scenario</div>}
        {tooltipOrder.map((a) => <div className="tip-row" key={a.id}><span className="tip-name"><i style={{ background: colors[a.id] }} /> {a.name}</span><span className="num">{fmtFull(av(a), cur)}</span></div>)}
        {hasProperty && <div className="tip-row tip-sub"><span>Spendable (excl. property)</span><span className="num">{fmtFull(stressed ? d.sInvestable : d.investable, cur)}</span></div>}
        {(stressed ? d.sDebt : d.debt) > 0 && <div className="tip-row"><span className="tip-name">Less: debts</span><span className="num">−{fmtFull(stressed ? d.sDebt : d.debt, cur)}</span></div>}
        {(stressed ? d.sDebt : d.debt) > 0 && <div className="tip-total"><span>Net worth after debts</span><b className="num">{fmtFull(sNet, cur)}</b></div>}
        {d.cmp != null && !stressed && <><div className="tip-rule" /><div className="tip-row"><span className="tip-name"><i style={{ background: "hsl(185 70% 42%)" }} /> {compareName || "Compared scenario"}</span><span className="num">{fmtFull(d.cmp, cur)}</span></div><div className="tip-row tip-cmp-delta"><span className="tip-name">vs this plan</span><span className="num">{(d.cmp - d.netWorth) >= 0 ? "+" : "−"}{fmtFull(Math.abs(d.cmp - d.netWorth), cur)}</span></div></>}
        {yearPayouts.length > 0 && <><div className="tip-rule" />{yearPayouts.map((e, i) => <div key={i} className="tip-row" style={{ color: t.green }}><span className="tip-name" style={{ color: t.green }}>↑ {e.label}</span><span className="num">received</span></div>)}</>}
        {d.taxPaid > 0 && <><div className="tip-rule" /><div className="tip-row"><span className="tip-name">Tax on withdrawals</span><span className="num">−{fmtFull(d.taxPaid, cur)}</span></div></>}
      </div>
    );
  };
  const FlowTip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const d = payload[0].payload;
    const net = d.income - d.outgoings;
    const yearPayouts = payoutEvents.filter((e) => e.year === d.year);
    return (
      <div className="tip">
        <div className="tip-head"><b className="num">{d.year}</b> <span className="tip-yr">{agesLabel(d)}</span></div>
        {incomes.map((i) => (d[iKey(i.id)] > 0 ? <div className="tip-row" key={i.id}><span className="tip-name"><i style={{ background: incColors[i.id] }} /> {i.name}</span><span className="num">{fmtFull(d[iKey(i.id)], cur)}</span></div> : null))}
        {yearPayouts.map((e, i) => <div key={`p${i}`} className="tip-row" style={{ color: t.green }}><span className="tip-name" style={{ color: t.green }}>↑ {e.label}</span><span className="num">to savings</span></div>)}
        <div className="tip-row tip-sub"><span>Total income</span><span className="num">{fmtFull(d.income, cur)}</span></div>
        {d.plannedDraw > 0 && <div className="tip-row"><span className="tip-name"><i style={{ background: DRAWDOWN_COLOR }} /> Planned drawdown</span><span className="num">{fmtFull(d.plannedDraw, cur)}</span></div>}
        {d.coveredBySavings > 0 && <div className="tip-row"><span className="tip-name"><i style={{ background: t.amber }} /> Drawn from savings</span><span className="num">{fmtFull(d.coveredBySavings, cur)}</span></div>}
        {d.uncovered > 0 && <div className="tip-row"><span className="tip-name"><i style={{ background: t.red }} /> Unfunded shortfall</span><span className="num">{fmtFull(d.uncovered, cur)}</span></div>}
        <div className="tip-rule" />
        {d.expEssential > 0 && <div className="tip-row"><span className="tip-name">Essential spending</span><span className="num">{fmtFull(d.expEssential, cur)}</span></div>}
        {d.expDiscretionary > 0 && <div className="tip-row"><span className="tip-name">Discretionary spending</span><span className="num">{fmtFull(d.expDiscretionary, cur)}</span></div>}
        {d.premiums > 0 && <div className="tip-row"><span className="tip-name">Protection premiums</span><span className="num">{fmtFull(d.premiums, cur)}</span></div>}
        {d.liabRepay > 0 && <div className="tip-row"><span className="tip-name">Loan repayments</span><span className="num">{fmtFull(d.liabRepay, cur)}</span></div>}
        {d.taxPaid > 0 && <div className="tip-row" style={{ color: t.amber }}><span className="tip-name">Tax on withdrawals</span><span className="num">{fmtFull(d.taxPaid, cur)}</span></div>}
        <div className="tip-total"><span>Total expenditure</span><b className="num">{fmtFull(d.expenditure, cur)}</b></div>
        {d.contrib > 0 && <><div className="tip-row"><span className="tip-name">Savings / contributions</span><span className="num">{fmtFull(d.contrib, cur)}</span></div><div className="tip-row tip-sub"><span>Total money out</span><span className="num">{fmtFull(d.outgoings, cur)}</span></div></>}
        <div className="tip-net" style={{ color: net >= 0 ? t.green : t.amber }}>{net >= 0 ? "Surplus " : "Funded by drawdown "}<span className="num">{fmtFull(Math.abs(net), cur)}</span></div>
      </div>
    );
  };
  const cssVars = {
    "--bg": t.bg, "--panel": t.panel, "--rail": t.rail, "--card": t.card, "--border": t.border, "--border-strong": t.borderStrong,
    "--ink": t.ink, "--mid": t.mid, "--low": t.low, "--accent": t.accent, "--accent-strong": t.accentStrong, "--accent-soft": t.accentSoft,
    "--green": t.green, "--amber": t.amber, "--red": t.red, "--track": t.track, "--shadow": t.shadow,
  };
  const NAV = [
    { id: "client", label: couple ? "Clients" : "Client", Icon: couple ? Users : User },
    { id: "assumptions", label: "Assumptions", Icon: SlidersHorizontal },
    { id: "tax", label: "Tax & Jurisdiction", Icon: Globe },
    { id: "assets", label: "Assets & Investments", Icon: Landmark },
    { id: "income", label: "Income", Icon: TrendingUp },
    { id: "expenditure", label: "Expenditure", Icon: Receipt },
    { id: "liabilities", label: "Liabilities", Icon: CreditCard },
    { id: "protection", label: "Protection", Icon: Shield },
    { id: "notes", label: "Adviser notes", Icon: StickyNote },
    { id: "scenarios", label: "Scenarios", Icon: Layers },
  ];
  const NAV_SOON = [];

  const clientCard = (which, client, fb) => {
    const age = which === "client1" ? ectx.age0c1 : ectx.age0c2;
    return (
      <div className="client-card">
        <div className="rec-grid">
          <div className="rec-field"><label>Name</label><Text value={client.name} placeholder={fb} onChange={(v) => upClient(which, { name: v })} /></div>
          <div className="rec-field"><label>Date of birth</label><input type="date" className="text-in num" value={client.dob} onChange={(e) => upClient(which, { dob: e.target.value })} /></div>
        </div>
        <div className="rec-grid">
          <div className="rec-field"><label>Retirement age</label><Mini value={client.retirementAge} suffix="yrs" onChange={(v) => upClient(which, { retirementAge: v })} /></div>
          <div className="rec-field"><label>Plan to age</label><Mini value={client.lifeExpectancy} suffix="yrs" onChange={(v) => upClient(which, { lifeExpectancy: v })} /></div>
        </div>
        <span className="field-note">Current age <b className="num">{age}</b></span>
      </div>
    );
  };

  return (
    <div className="app-root" style={cssVars} data-theme={theme}>
      <style>{CSS}</style>

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><svg viewBox="0 0 48 54" width="20" height="22" fill="none" aria-hidden="true"><path d="M5 48 L5 12 L24 35 L43 12 L43 48" stroke="#0CA5A5" strokeWidth="6" strokeLinecap="butt" strokeLinejoin="miter" /><circle cx="24" cy="6" r="3.2" fill="#C8A951" /></svg></div>
          <div className="brand-text"><span className="brand-name">Meridian</span><span className="brand-tag">{couple ? `${fn1} & ${fn2}` : "International cashflow forecasting"}</span></div>
        </div>
        <div className="topbar-tools">
          {!present && (<>
            <select className="cur-sel num" value={cur} onChange={(e) => setProfile((p) => ({ ...p, currency: e.target.value }))}>{Object.values(CURRENCIES).map((c) => <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}</select>
            <button className="icon-btn" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? <Moon size={16} /> : <Sun size={16} />}</button>
            <button className="report-btn" onClick={() => { setReportStage("options"); setCommentaryEdit(null); setReportOpen(true); }}><FileText size={15} /><span>Report</span></button>
          </>)}
          <button className="btn-primary" onClick={() => setPresent(!present)}>{present ? <Minimize2 size={15} /> : <Maximize2 size={15} />}<span>{present ? "Exit client view" : "Client view"}</span></button>
        </div>
      </header>

      <div className={`app ${present ? "present" : ""}`}>
        {!present && (
          <nav className="rail">
            <div className="rail-group">{NAV.map((n) => <button key={n.id} className={`rail-item ${section === n.id ? "active" : ""}`} onClick={() => setSection(n.id)}><n.Icon size={17} /><span className="rail-label">{n.label}</span></button>)}</div>
            <div className="rail-divider" />
            {NAV_SOON.length > 0 && <div className="rail-group">{NAV_SOON.map((n) => <button key={n.id} className="rail-item soon" disabled><n.Icon size={17} /><span className="rail-label">{n.label}</span><span className="soon-pill">Soon</span></button>)}</div>}
          </nav>
        )}
        {!present && <div className="tabbar">{NAV.map((n) => <button key={n.id} className={`tab ${section === n.id ? "active" : ""}`} onClick={() => setSection(n.id)}><n.Icon size={15} /> {n.label}</button>)}</div>}

        {!present && (
          <section className="editor">
            {section === "client" && (
              <div className="ed-body">
                <h2 className="ed-title">{couple ? "Clients" : "Client"}</h2>
                <div className="couple-toggle">
                  <div><div className="ct-title">Plan for a couple</div><div className="ct-sub">Adds a second client, joint tagging and survivorship</div></div>
                  <Toggle on={couple} onClick={() => setProfile((p) => ({ ...p, couple: !p.couple }))} />
                </div>
                <div className="client-label">{couple ? fn1 : "Client"}</div>
                {clientCard("client1", c1, "Client 1")}
                {couple && (<>
                  <div className="client-label">{fn2}</div>
                  {clientCard("client2", c2, "Client 2")}
                  <div className="field"><label>Survivor's living costs</label><Mini value={assumptions.survivorExpenseFactor} suffix="%" onChange={(v) => setAssumptions((a) => ({ ...a, survivorExpenseFactor: v }))} /><span className="field-note">When one partner dies, shared costs (home, bills, food) rarely halve. This sets what proportion of the couple's joint spending continues — 100% means no change; 60–70% is a common assumption. Personal income, expenses and pensions follow their own rules.</span></div>
                </>)}
                <p className="ed-hint">Each person retires and is planned to their own age. Every asset, income and expense is tagged to a person or Joint, so survivorship just works.</p>
              </div>
            )}
            {section === "assumptions" && (
              <div className="ed-body">
                <h2 className="ed-title">Assumptions</h2>
                <div className="field"><label>Inflation rate</label><Mini value={assumptions.inflation} step={0.1} suffix="%" onChange={(v) => setAssumptions((a) => ({ ...a, inflation: v }))} /><span className="field-note">Drives every "with inflation" line and the today's-money view.</span></div>
                {(() => {
                  const cashInv = assets.filter((a) => a.type === "cash" || a.type === "investment");
                  const hasCash = assets.some((a) => a.type === "cash");
                  const surplusMode = assumptions.autoInvestSurplus === false ? "leave" : (assumptions.surplusGrowth === "invest" ? "reinvest" : "cash");
                  const setMode = (m) => setAssumptions((a) => ({ ...a, autoInvestSurplus: m !== "leave", surplusGrowth: m === "reinvest" ? "invest" : "cash" }));
                  const opts = [
                    { value: "reinvest", label: "Reinvested", desc: "Added to investments each year and compounds at the investment growth rate. The most optimistic — on long plans this can shift the end result by seven figures." },
                    { value: "cash", label: "Saved as cash", desc: hasCash ? "Swept into cash each year, growing only at the cash rate. Safer, but inflation slowly erodes its real value." : "Swept into savings each year — but there's no cash account yet, so it sits in your first investment until you add one." },
                    { value: "leave", label: "Leaves the plan", desc: "Treated as spent or moved elsewhere. Pots grow only by their own returns and contributions. Best when illustrating a single product or investment." },
                  ];
                  return (
                  <div className="surplus-primary">
                    <label className="flbl">What happens to spare income each year? <InfoTip text="Every year a household earns more than it spends, that surplus has to go somewhere. This single choice is one of the biggest drivers of the end result — on a high-earning plan the gap between 'reinvested' and 'leaves the plan' can be several million pounds. It's surfaced here so it's a deliberate decision, not a hidden default." /></label>
                    <div className="surplus-opts">
                      {opts.map((o) => (
                        <button key={o.value} type="button" className={`surplus-opt ${surplusMode === o.value ? "on" : ""}`} onClick={() => setMode(o.value)}>
                          <span className="surplus-opt-top"><span className="surplus-radio" />{o.label}</span>
                          <span className="surplus-opt-desc">{o.desc}</span>
                        </button>
                      ))}
                    </div>
                    {surplusMode !== "leave" && cashInv.length > 0 && (
                      <div className="field surplus-dest"><label>Send it to</label><Pick value={assumptions.surplusDestId && cashInv.some((a) => a.id === assumptions.surplusDestId) ? assumptions.surplusDestId : ""} onChange={(v) => setAssumptions((a) => ({ ...a, surplusDestId: v || null }))} options={[{ value: "", label: couple ? "Auto — each partner's own pot" : "Auto — best matching pot" }, ...cashInv.map((a) => ({ value: a.id, label: a.name || "Untitled" }))]} /><span className="field-note">{assumptions.surplusDestId && cashInv.some((a) => a.id === assumptions.surplusDestId) ? "All surplus goes to this one account each year, whoever earned it — this overrides the choice above." : couple ? "Auto: each partner's surplus is worked out separately and lands in their own pot, so it transfers by that person's rules on death. Joint income and spending are split evenly. Pick a specific account to override." : "Auto picks the pot that matches your choice above. Pick a specific account to override."}</span></div>
                    )}
                  </div>
                  );
                })()}
                {(() => {
                  const sp = assumptions.spendingPattern || { mode: "flat", slowGoAge: 75, noGoAge: 85, slowGoMult: 90, noGoMult: 75 };
                  const smile = sp.mode === "smile";
                  const setSP = (p) => setAssumptions((a) => ({ ...a, spendingPattern: { ...sp, ...p } }));
                  const hasDisc = expenses.some((e) => e.priority === "discretionary");
                  return (
                  <div className="spend-primary">
                    <label className="flbl">Spending through retirement <InfoTip text="Most people don't spend evenly through retirement. The early 'active' years (travel, hobbies) tend to cost more; spending often eases through the quieter years and again in later life. This applies a multiplier to discretionary (lifestyle) spending by age — essential costs are never reduced. Keyed to the primary client's age." /></label>
                    <div className="spend-mode"><Seg value={smile ? "smile" : "flat"} onChange={(v) => setSP({ mode: v })} options={[{ value: "flat", label: "Stays level" }, { value: "smile", label: "Eases with age" }]} /></div>
                    <span className="field-note">{smile ? "Lifestyle spending steps down through later retirement (the \u201Cretirement smile\u201D). Essential costs continue unchanged." : "Spending stays at the level you've entered for the whole plan."}</span>
                    {smile && (
                      <div className="spend-bands">
                        <div className="spend-band"><div className="spend-band-name">Active years <em>retirement → {sp.slowGoAge}</em></div><div className="spend-band-val">100%<span>of lifestyle spend</span></div></div>
                        <div className="spend-band"><div className="spend-band-name">Quieter years <em>{sp.slowGoAge} → {sp.noGoAge}</em></div><div className="spend-band-edit"><Mini value={sp.slowGoMult} suffix="%" onChange={(v) => setSP({ slowGoMult: Math.min(100, Math.max(0, Number(v) || 0)) })} /></div></div>
                        <div className="spend-band"><div className="spend-band-name">Later years <em>{sp.noGoAge}+</em></div><div className="spend-band-edit"><Mini value={sp.noGoMult} suffix="%" onChange={(v) => setSP({ noGoMult: Math.min(100, Math.max(0, Number(v) || 0)) })} /></div></div>
                        <div className="spend-ages"><label>Quieter from age</label><Mini value={sp.slowGoAge} onChange={(v) => setSP({ slowGoAge: Math.max(1, Number(v) || 75) })} /><label>Later from age</label><Mini value={sp.noGoAge} onChange={(v) => setSP({ noGoAge: Math.max((Number(sp.slowGoAge) || 75) + 1, Number(v) || 85) })} /></div>
                        {!hasDisc && <span className="field-note spend-warn">No spending is tagged as discretionary yet, so this has no effect. Tag lifestyle costs as “discretionary” on the expense for the smile to apply.</span>}
                      </div>
                    )}
                  </div>
                  );
                })()}
                {(() => {
                  const DT = ["cash", "investment", "pension", "property"];
                  const order = (() => { const saved = Array.isArray(assumptions.liquidationOrder) ? assumptions.liquidationOrder.filter((x) => DT.includes(x)) : []; DT.forEach((x) => { if (!saved.includes(x)) saved.push(x); }); return saved; })();
                  const move = (i, dir) => { const j = i + dir; if (j < 0 || j >= order.length) return; const next = order.slice(); [next[i], next[j]] = [next[j], next[i]]; setAssumptions((a) => ({ ...a, liquidationOrder: next })); };
                  const btn = (dis) => ({ cursor: dis ? "default" : "pointer", border: "1px solid var(--border)", background: "var(--card)", borderRadius: 6, width: 26, height: 26, fontSize: 13, lineHeight: "1", color: "var(--ink)", opacity: dis ? 0.3 : 1 });
                  return (
                  <div className="liq-order" style={{ marginTop: 14 }}>
                    <label className="flbl">When money's needed, draw from pots in this order <InfoTip text="When spending exceeds income, the plan drains these pot types in this order until the need is met. Order matters for tax and estate planning — e.g. drawing investments before pensions can leave more in the pension, which often passes on more efficiently. Only pots marked 'available for drawdown' are ever touched, and pensions only once the owner reaches retirement age." /></label>
                    <div className="liq-rows">
                      {order.map((type, i) => (
                        <div key={type} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 9, marginTop: 6 }}>
                          <span style={{ width: 18, textAlign: "center", fontWeight: 700, color: "var(--mid)", fontSize: 12 }}>{i + 1}</span>
                          <span style={{ flex: 1, fontWeight: 600 }}>{TYPE_LABEL[type]}</span>
                          <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move earlier" style={btn(i === 0)}>↑</button>
                          <button type="button" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="Move later" style={btn(i === order.length - 1)}>↓</button>
                        </div>
                      ))}
                    </div>
                    <span className="field-note">Drained first to last until spending is covered. The default puts cash first and pensions late, which suits most estate-planning goals.</span>
                  </div>
                  );
                })()}
                <div className="risk-block">
                  <label className="flbl">Risk profiles <InfoTip text="Picking a profile applies its growth rates to every asset that person owns — Cautious 3%, Balanced 5%, Growth 6.5%, Aggressive 8% on investments and pensions, with cash and property scaled to match. You can still fine-tune any individual asset afterwards; the label will show 'edited' so you know it no longer matches the template." /></label>
                  {riskOwnerKeys.map((k) => (
                    <div className="rec-field risk-row" key={k}>
                      <label>{riskOwnerLabel(k)}{riskDrift[k] && <em className="risk-edited"> · edited</em>}</label>
                      <Pick value={riskProfiles[k] || ""} onChange={(v) => applyRiskProfile(k, v)} options={[{ value: "", label: "Custom / not set" }, ...RISK_PROFILES.map((p) => ({ value: p.id, label: p.label }))]} />
                    </div>
                  ))}
                  <span className="field-note">{couple ? "Different profiles per client let you show what-if comparisons — e.g. one Cautious, one Growth. " : ""}Rates applied per asset type: {RISK_PROFILES.map((p) => `${p.label} ${getRiskRates(p.id).investment}%`).join(" · ")} (investments/pensions; cash and property scaled accordingly).</span>
                  <div className="risk-tools">
                    <button className="xc-btn" onClick={() => setRiskEditOpen((v) => !v)}>{riskEditOpen ? "Done editing rates" : "Edit template rates"}{riskRatesCustomised && !riskEditOpen ? " · customised" : ""}</button>
                    {riskRatesCustomised && riskEditOpen && <button className="xc-btn" onClick={resetRiskRates}>Reset to defaults</button>}
                  </div>
                  {riskEditOpen && (
                    <div className="risk-editor">
                      <div className="risk-ed-row risk-ed-head"><span /><span>Cash</span><span>Invest</span><span>Pension</span><span>Property</span></div>
                      {RISK_PROFILES.map((p) => { const r = getRiskRates(p.id); return (
                        <div className="risk-ed-row" key={p.id}>
                          <span className="risk-ed-name">{p.label}</span>
                          {["cash", "investment", "pension", "property"].map((ty) => <Mini key={ty} value={r[ty]} step={0.1} suffix="%" onChange={(v) => setRiskRate(p.id, ty, v)} />)}
                        </div>
                      ); })}
                      <span className="field-note">Your house assumptions — {onFirmSettingsChange ? "shared across your firm" : "saved on this device"} and used whenever a profile is applied. Changing a rate here doesn't alter existing plans until a profile is re-applied.</span>
                    </div>
                  )}
                </div>
                <div className="goalp">
                  <div className="goalp-head"><span className="flbl">Retirement income goal <InfoTip text="Enter the annual retirement income the client wants. Using a sustainable withdrawal rate (4% is the common rule of thumb), this shows the capital required, the gap versus what the plan currently projects at retirement, and the extra monthly saving that would close it. A planning illustration, not advice." /></span><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:"0.68rem",textTransform:"uppercase",letterSpacing:"0.05em",color:"var(--mid)",opacity:0.7,fontWeight:600,paddingRight:2}}>Capital check</span><Toggle on={retGoal.enabled} onClick={() => upRetGoal({ enabled: !retGoal.enabled })} /></div></div>
                  {retGoal.enabled && (<>
                    <div className="goalp-inputs">
                      <div className="rec-field"><label>Desired income / yr</label><Money value={retGoal.income} symbol={sym} onChange={(v) => upRetGoal({ income: v })} /></div>
                      <div className="rec-field"><label>Withdrawal rate</label><Mini value={retGoal.swr} step={0.1} suffix="%" onChange={(v) => upRetGoal({ swr: v })} /></div>
                    </div>
                    {retGoalCalc && (
                      <div className={`goalp-out ${retGoalCalc.onTrack ? "on-track" : "gap"}`}>
                        {retGoalCalc.onTrack ? (
                          <div className="goalp-verdict ok">✓ On track — the plan projects {fmtFull(retGoalCalc.projInvestable, cur)} of investable capital at retirement, supporting about {fmtFull(retGoalCalc.projIncome, cur)}/yr at {retGoalCalc.swr}%.</div>
                        ) : (
                          <div className="goalp-verdict short">Projected income falls short by <b className="goalp-redfig">{fmtFull(retGoalCalc.incomeGap, cur)}/yr</b>.</div>
                        )}
                        <div className="goalp-rows">
                          <div className="goalp-row"><span>Capital required ({retGoalCalc.swr}% rule)</span><b className="num">{fmtFull(retGoalCalc.requiredCapital, cur)}</b></div>
                          <div className="goalp-row"><span>Projected at retirement</span><b className="num">{fmtFull(retGoalCalc.projInvestable, cur)}</b></div>
                          {!retGoalCalc.onTrack && <div className="goalp-row"><span>Capital gap</span><b className="num goalp-redfig">{fmtFull(retGoalCalc.capitalGap, cur)}</b></div>}
                          {!retGoalCalc.onTrack && retGoalCalc.monthly != null && retGoalCalc.yearsToRet > 0 && <div className="goalp-row"><span>Extra saving to close it</span><b className="num goalp-redfig">{sym}{Math.ceil(retGoalCalc.monthly).toLocaleString()}/mo</b></div>}
                          {!retGoalCalc.onTrack && retGoalCalc.yearsToRet === 0 && <div className="goalp-row"><span></span><span className="inl-note">Already at retirement — close the gap with additional capital or a lower income target.</span></div>}
                          <div className="goalp-row"><span>Drawing {fmtFull(retGoalCalc.target, cur)}/yr, the pot alone</span><b className="num">{retGoalCalc.sustainable ? "is self-sustaining" : retGoalCalc.depleteAge != null ? `lasts to ~age ${retGoalCalc.depleteAge}` : "—"}</b></div>
                        </div>
                        <span className="field-note">Today's money; 'investable capital' excludes property. The 'lasts to ~age' figure is a rule-of-thumb: it assumes the pot is invested for income at the real return of your investments and pensions — or a balanced default if the plan holds none — and is drawn down on its own, with no other income counted. Because it ignores your actual asset mix and other income, it can differ from the plan's own year-by-year projection, which is the figure to rely on. Extra saving assumes the same return over {retGoalCalc.yearsToRet} years. Illustration, not advice.</span>
                        <span className="field-note" style={{marginTop:4,paddingTop:4,borderTop:"1px solid var(--border)",opacity:0.75}}>This is a <b>capital check</b> — it asks whether the pot at retirement hits a target number. The <b>What-if panel</b> runs a full lifetime simulation year by year, including all income and contributions, so the two can give different verdicts for the same plan. Both are valid; they answer different questions.</span>
                      </div>
                    )}
                  </>)}
                </div>
                <p className="ed-hint">Per-asset growth is set on each asset. Mortality is set per client. Charges &amp; fees module is next once we map your fee structure.</p>
              </div>
            )}
            {section === "tax" && (
              <div className="ed-body">
                <h2 className="ed-title">Tax &amp; jurisdiction</h2>
                <div className="tax-enable">
                  <div><div className="tax-enable-title">Apply tax to this plan</div><div className="tax-enable-sub">International plans usually leave this off. Turn it on to tax pension withdrawals, apply a CGT rate, and handle offshore-bond rules — including a client who changes tax residence partway through the plan.</div></div>
                  <Toggle on={tax.enabled} onClick={() => setTax({ enabled: !tax.enabled })} />
                </div>
                {tax.enabled && (
                  <>
                    <div className="tax-tl-head">Residence timeline <InfoTip text={`Periods run in age order, anchored to ${couple ? fn1 + "'s" : "the client's"} age. The first starts now; add one to model a move — e.g. tax-free until 60, then UK rates from 60. Each period sets its own income-tax bands and CGT rate. Tax only affects years where money is withdrawn from pensions or investment pots, or where you've marked an income as gross/taxable.`} /></div>
                    {tax.periods.map((p, idx) => (
                      <div className="tax-period" key={p.id}>
                        <div className="tax-period-top">
                          <input className="tax-label-in" value={p.label} onChange={(e) => upPeriod(p.id, { label: e.target.value })} placeholder="Jurisdiction" />
                          {idx === 0
                            ? <span className="tax-from">from now</span>
                            : <span className="tax-from">from {couple ? `${fn1}'s age` : "age"} <NumberInput className="tax-age" value={p.startAge} onCommit={(v) => upPeriod(p.id, { startAge: v })} /> <em className="tax-yr">≈ {baseYear + Math.max(0, Math.round((Number(p.startAge) || 0) - ectx.age0c1))}</em></span>}
                          {tax.periods.length > 1 && <button className="rec-del" onClick={() => rmPeriod(p.id)}><Trash2 size={14} /></button>}
                        </div>
                        <div className="tax-presets"><span>Preset:</span><button onClick={() => applyPreset(p.id, "none")}>No tax (UAE/Gulf)</button><button onClick={() => applyPreset(p.id, "uk")}>UK 2025/26</button><button onClick={() => applyPreset(p.id, "blank")}>Custom (blank)</button></div>
                        <div className="rec-grid">
                          <div className="rec-field"><label>Tax-free allowance</label><div className="money"><span className="money-sym">{sym}</span><NumberInput className="money-in" value={p.personalAllowance} step={500} onCommit={(v) => upPeriod(p.id, { personalAllowance: v })} /></div></div>
                          <div className="rec-field"><label>CGT on investment drawdown <InfoTip text="Capital gains tax applied to money drawn from investment pots while in this jurisdiction (not cash, pensions or offshore bonds). Set 0 for a tax-free jurisdiction like the UAE, or for ISAs. A simplified effective rate you control — it taxes the whole withdrawal, not just the gain." /></label><Mini value={p.cgtRate != null ? p.cgtRate : tax.cgtRate} suffix="%" onChange={(v) => upPeriod(p.id, { cgtRate: Math.min(99, Math.max(0, Number(v) || 0)) })} /></div>
                        </div>
                        <div className="tax-bands">
                          <div className="tax-bands-head"><span>Income up to</span><span>Rate</span><span /></div>
                          {p.bands.length === 0 && <div className="tax-band-empty">No income tax in this period.</div>}
                          {p.bands.map((b, i) => (
                            <div className="tax-band" key={i}>
                              <div className="money sm"><span className="money-sym">{sym}</span><input type="number" className="num money-in" value={b.upTo == null ? "" : b.upTo} placeholder="no cap" step={1000} onChange={(e) => upBand(p.id, i, { upTo: e.target.value })} /></div>
                              <div className="mininum sm"><NumberInput value={b.rate} step={1} onCommit={(v) => upBand(p.id, i, { rate: v })} /><span>%</span></div>
                              <button className="rec-del" onClick={() => rmBand(p.id, i)}><Trash2 size={13} /></button>
                            </div>
                          ))}
                          <button className="add-band" onClick={() => addBand(p.id)}><Plus size={13} /> Add band</button>
                          <p className="ed-hint">Leave the top band's "up to" blank for no ceiling. Thresholds are total taxable income; the allowance is the 0% portion below them.</p>
                        </div>
                      </div>
                    ))}
                    <button className="add-btn wide" onClick={addPeriod}><Plus size={15} /> Add a move / new jurisdiction</button>
                    <div className="tax-lifetime"><span>Lifetime tax in this plan</span><b className="num">{fmtFull(lifetimeTax, cur)}</b><em>{showReal ? "today's money" : "future money"} · updates live as you edit</em></div>
                    <p className="ed-hint">By default each income is treated as net (take-home) and isn't taxed again. To model income that's taxable in a jurisdiction — a UK salary, state or rental income after a move — open the income and set its tax treatment to <b>Gross / taxable</b>; it's then taxed using the bands of whichever period is active. CGT on investment drawdown and offshore-bond gains above the 5% allowance follow the active period too. To compare jurisdictions side by side, duplicate this plan in Scenarios, change the residence timeline in the copy, and hit Compare.</p>
                    <p className="tax-disclaimer">Tax figures are illustrative estimates based on the assumptions you set above. They are not tax advice and should not be relied upon — tax treatment depends on individual circumstances and changes over time.</p>
                  </>
                )}
                <div className="estate-block">
                  <div className="tax-enable estate-enable">
                    <div><div className="tax-enable-title">Estate &amp; succession tax</div><div className="tax-enable-sub">Off by default. Models a one-off tax on the estate at the end of the plan — UK inheritance tax, or any jurisdiction's succession duty. Independent of the income tax above.</div></div>
                    <Toggle on={est.enabled} onClick={() => setEstate({ enabled: !est.enabled })} />
                  </div>
                  {est.enabled && (<>
                    <div className="tax-presets"><span>Preset:</span><button onClick={() => setEstate({ nrb: 325000, rnrb: 175000, rate: 40, transferableNrb: true, taperThreshold: 2000000 })}>UK IHT 2025/26</button><button onClick={() => setEstate({ nrb: 0, rnrb: 0, rate: 0, taperThreshold: 0 })}>Clear</button></div>
                    <div className="field"><label>Tax-free allowance (nil-rate band)</label><div className="money"><span className="money-sym">{sym}</span><NumberInput className="money-in" value={est.nrb} step={5000} onCommit={(v) => setEstate({ nrb: v })} /></div><span className="field-note">The amount passing free of tax. The UK nil-rate band is {sym}325,000.</span></div>
                    <div className="field"><label>Residence allowance (optional)</label><div className="money"><span className="money-sym">{sym}</span><NumberInput className="money-in" value={est.rnrb} step={5000} onCommit={(v) => setEstate({ rnrb: v })} /></div><span className="field-note">UK residence nil-rate band ({sym}175,000) where a main home passes to direct descendants. Leave at 0 if it doesn't apply.</span></div>
                    <div className="field"><label>Tax rate above the allowance</label><Mini value={est.rate} suffix="%" onChange={(v) => setEstate({ rate: Math.min(100, Math.max(0, Number(v) || 0)) })} /></div>
                    {couple && <div className="rec-field rec-toggle"><label>Transferable allowance on second death <InfoTip text="On the first death, assets passing to a spouse are normally exempt and that partner's unused allowance transfers. With this on, the survivor's estate carries both partners' allowances (and residence allowances). This models the second death only — the point at which the tax usually falls due." /></label><Toggle on={est.transferableNrb !== false} onClick={() => setEstate({ transferableNrb: !(est.transferableNrb !== false) })} /></div>}
                    {(() => { const ec = computeEstate(kpis.endVal, est, couple); return (
                      <div className="estate-preview">
                        <div className="estate-prev-row"><span>Projected estate at plan end ({kpis.endYear})</span><b className="num">{fmtFull(ec.gross, cur)}</b></div>
                        <div className="estate-prev-row"><span>Tax-free allowance{couple && est.transferableNrb !== false ? " (both partners)" : ""}</span><b className="num">{fmtFull(ec.allowance, cur)}</b></div>
                        {ec.rnrbTapered > 0 && <div className="estate-prev-row" style={{ fontSize: 12, opacity: 0.75 }}><span>Residence band tapered (estate over {fmtFull(Number(est.taperThreshold) || 0, cur)})</span><b className="num">−{fmtFull(ec.rnrbTapered, cur)}</b></div>}
                        <div className="estate-prev-row estate-prev-tax"><span>Estimated tax</span><b className="num">{ec.tax > 0 ? "−" : ""}{fmtFull(ec.tax, cur)}</b></div>
                        <div className="estate-prev-row estate-prev-net"><span>Net to beneficiaries</span><b className="num">{fmtFull(ec.net, cur)}</b></div>
                      </div>
                    ); })()}
                    <p className="tax-disclaimer">A simplified illustration: a flat allowance and single rate on the end-of-plan estate, in today's money. It applies the residence-band taper on large estates but does not model lifetime gifts, trusts, or business and agricultural relief. Not tax or estate-planning advice.</p>
                  </>)}
                </div>
              </div>
            )}
            {section === "assets" && (
              <div className="ed-body">
                <div className="ed-head"><h2 className="ed-title">Assets &amp; investments</h2><div className="ed-head-tools"><ExpandCtl items={assets} open={open} onExpand={expandAll} onCollapse={collapseAll} /><ClearAll count={assets.length} onConfirm={clearAssets} /><button className="add-btn" onClick={addAsset}><Plus size={15} /> Add</button></div></div>
                {assets.length === 0 && <p className="empty-note">No assets yet. Add savings, investments, pensions or property — the chart builds from here.</p>}
                {assets.map((a) => {
                  const expanded = open.has(a.id);
                  const realRet = ((Number(a.growthRate) || 0) - (Number(assumptions.inflation) || 0)).toFixed(1);
                  const ownerName = (ownerOpts.find((o) => o.value === (a.owner || "client1")) || {}).label || "";
                  return (
                    <div className={`rec ${expanded ? "open" : ""}`} key={a.id}>
                      <div className="rec-bar" role="button" tabIndex={0} onClick={() => openSolo(a.id, assets)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSolo(a.id, assets); } }}>
                        <span className="swatch" style={{ background: colors[a.id] }} />
                        <span className="rec-name-r">{a.name || "Untitled"}</span>
                        {couple && <span className="owner-chip">{ownerName}</span>}
                        <span className="rec-sum num">{sym}{(Number(a.value) || 0).toLocaleString()}</span>
                        <QuickDel onConfirm={() => rmAsset(a.id)} />
                        <ChevronDown size={15} className="chev" />
                      </div>
                      {expanded && (
                        <div className="rec-body">
                          <label className="flbl">Name</label>
                          <input className="rec-name" value={a.name} onChange={(e) => upAsset(a.id, { name: e.target.value })} placeholder="Name" />
                          {couple && <div className="rec-field"><label>Belongs to</label><Pick value={a.owner || "client1"} onChange={(v) => upAsset(a.id, { owner: v })} options={ownerOpts} /></div>}
                          <div className="rec-grid">
                            <div className="rec-field"><label>Type</label><Pick value={a.type} onChange={(v) => upAsset(a.id, { type: v, ...(v === "property" ? { drawdown: false } : {}) })} options={ASSET_TYPES} /></div>
                            <div className="rec-field"><label>Value</label><Money value={a.value} symbol={sym} onChange={(v) => upAsset(a.id, { value: v })} /></div>
                          </div>
                          <div className="rec-grid">
                            <div className="rec-field"><label>Growth <InfoTip text="The assumed annual return for this asset, before inflation. The 'real' figure shown is what's left after inflation — the actual growth in spending power." /></label><Mini value={a.growthRate} step={0.1} suffix="%" onChange={(v) => upAsset(a.id, { growthRate: v })} /><span className="inl-note">real {realRet}%</span></div>
                            <div className="rec-field rec-toggle"><label>Available for drawdown <InfoTip text="If on, this pot can be spent down to cover any gap between income and spending. Turn it off to ring-fence the asset — for example, to keep a property untouched." /></label><Toggle on={a.drawdown} onClick={() => upAsset(a.id, { drawdown: !a.drawdown })} /></div>
                            {tax.enabled && a.type === "investment" && (
                              <div className="rec-field rec-toggle"><label>Offshore bond (5% rule) <InfoTip text="UK offshore bonds (e.g. RL360, Zurich Intl): up to 5% of the original premium can be withdrawn each year with no immediate income tax, accruing for up to 20 years. Withdrawals beyond the allowance are taxed as income at the active jurisdiction's rate." /></label><Toggle on={!!a.offshoreBond} onClick={() => upAsset(a.id, { offshoreBond: !a.offshoreBond })} /></div>
                            )}
                          </div>
                          <div className="contrib">
                            <button className="contrib-head" onClick={() => upContrib(a.id, { enabled: !a.contribution.enabled })}><span className={`toggle sm ${a.contribution.enabled ? "on" : ""}`} aria-hidden="true"><span /></span> Regular contribution</button>
                            {a.contribution.enabled && (<>
                              <div className="rec-grid">
                                <div className="rec-field"><label>Amount</label><Money value={a.contribution.amount} symbol={sym} onChange={(v) => upContrib(a.id, { amount: v })} /></div>
                                <div className="rec-field"><label>Frequency</label><Pick value={a.contribution.frequency} onChange={(v) => upContrib(a.id, { frequency: v })} options={CONTRIB_FREQS} /></div>
                              </div>
                              <div className="rec-grid">
                                <div className="rec-field"><label>Starts</label><Anchor value={a.contribution.start} owner={a.owner || "client1"} ectx={ectx} onChange={(v) => upContrib(a.id, { start: v })} /></div>
                                {a.contribution.frequency !== "oneoff" && <div className="rec-field"><label>Ends</label><Anchor value={a.contribution.end} owner={a.owner || "client1"} ectx={ectx} onChange={(v) => upContrib(a.id, { end: v })} /></div>}
                              </div>
                              {a.contribution.frequency !== "oneoff" && (
                                <div className="rec-grid">
                                  <div className="rec-field"><label>Increase</label><Pick value={a.contribution.escalation || "none"} onChange={(v) => upContrib(a.id, { escalation: v })} options={ESCS} />{a.contribution.escalation === "inflation" && <span className="inl-note">at {assumptions.inflation}%</span>}</div>
                                  {a.contribution.escalation === "custom" && <div className="rec-field"><label>Rate</label><Mini value={a.contribution.customEsc || 0} step={0.1} suffix="%" onChange={(v) => upContrib(a.id, { customEsc: v })} /></div>}
                                </div>
                              )}
                              {a.type === "pension" && <div className="rec-field"><label>Source <InfoTip text="Personal contributions are paid from cashflow, so they reduce the surplus available each year. Employer contributions are added straight to the pot and don't affect the client's cashflow." /></label><Seg value={a.contribution.source} onChange={(v) => upContrib(a.id, { source: v })} options={[{ value: "personal", label: "Personal" }, { value: "employer", label: "Employer" }]} /><span className="inl-note">{a.contribution.source === "employer" ? "added to pot, doesn't reduce cashflow" : "funded from surplus"}</span></div>}
                              <div className="rec-field"><label>Funded from <InfoTip text="Cashflow: the contribution is paid out of this plan's income, so it reduces the surplus each year — and if there isn't enough income, it's drawn from savings. Standalone: the money is assumed to come from outside the modelled cashflow, so the pot simply grows by the contribution with no withdrawal. Use Standalone to illustrate an investment's growth in isolation, without entering income and expenditure." /></label><Seg value={a.contribution.funding || "cashflow"} onChange={(v) => upContrib(a.id, { funding: v })} options={[{ value: "cashflow", label: "Cashflow" }, { value: "external", label: "Standalone" }]} /><span className="inl-note">{(a.contribution.funding || "cashflow") === "external" ? "illustrative — grows the pot, ignores cashflow" : "reduces this year's surplus"}</span></div>
                              {couple && (a.contribution.funding || "cashflow") === "cashflow" && !(a.contribution.source === "employer" && a.type === "pension") && (
                                <div className="rec-field"><label>Paid by <InfoTip text="Who funds this contribution. When that person dies or their income stops, this contribution stops — even if the pot itself is joint. To model two partners contributing different amounts to the same pot, set Partner A's contribution here and add a second asset of the same type for Partner B's share, or split the pot in two. One contribution entry = one contributor." /></label><Pick value={a.contribution.contributor || a.owner || "client1"} onChange={(v) => upContrib(a.id, { contributor: v })} options={ownerOpts} /><span className="inl-note">{a.contribution.contributor && a.contribution.contributor !== (a.owner || "client1") ? "stops when this person's income stops or they die" : "defaults to the asset owner"}</span></div>
                              )}
                            </>)}
                          </div>
                          {a.type !== "property" && (
                            <div className="contrib">
                              <button className="contrib-head" onClick={() => upAsset(a.id, { withdrawal: { ...(a.withdrawal || withdrawalDefault()), enabled: !(a.withdrawal && a.withdrawal.enabled) } })}><span className={`toggle sm ${a.withdrawal && a.withdrawal.enabled ? "on" : ""}`} aria-hidden="true"><span /></span> Planned withdrawal</button>
                              {a.withdrawal && a.withdrawal.enabled && (<>
                                <div className="rec-grid">
                                  <div className="rec-field"><label>Amount</label><Money value={a.withdrawal.amount} symbol={sym} onChange={(v) => upWithdrawal(a.id, { amount: v })} /></div>
                                  <div className="rec-field"><label>Frequency</label><Pick value={a.withdrawal.frequency} onChange={(v) => upWithdrawal(a.id, { frequency: v })} options={CONTRIB_FREQS} /></div>
                                </div>
                                <div className="rec-grid">
                                  <div className="rec-field"><label>Starts</label><Anchor value={a.withdrawal.start} owner={a.owner || "client1"} ectx={ectx} onChange={(v) => upWithdrawal(a.id, { start: v })} /></div>
                                  {a.withdrawal.frequency !== "oneoff" && <div className="rec-field"><label>Ends</label><Anchor value={a.withdrawal.end} owner={a.owner || "client1"} ectx={ectx} onChange={(v) => upWithdrawal(a.id, { end: v })} /></div>}
                                </div>
                                {(a.withdrawal.frequency || "annual") !== "oneoff" && (
                                  <div className="rec-grid">
                                    <div className="rec-field"><label>Increase</label><Pick value={a.withdrawal.escalation || "none"} onChange={(v) => upWithdrawal(a.id, { escalation: v })} options={ESCS} />{a.withdrawal.escalation === "inflation" && <span className="inl-note">at {assumptions.inflation}%</span>}</div>
                                    {a.withdrawal.escalation === "custom" && <div className="rec-field"><label>Rate</label><Mini value={a.withdrawal.customEsc || 0} step={0.1} suffix="%" onChange={(v) => upWithdrawal(a.id, { customEsc: v })} /></div>}
                                  </div>
                                )}
                                <span className="inl-note">{a.type === "pension" ? "Drawn from the owner's retirement age. " : ""}Paid out as income (a "Planned drawdown" band on the money chart) — never counted as an expense, so it can't be double-counted. Capped at the available balance.</span>
                              </>)}
                            </div>
                          )}
                          {couple && <span className="inl-note">Passes to the survivor on death.</span>}
                          <button className="del-row" onClick={() => rmAsset(a.id)}><Trash2 size={13} /> Remove</button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <p className="ed-hint">Drawdown order when spending exceeds income: cash → investments → pensions (locked until that person retires). Property stays untouched unless you mark it "available for drawdown".</p>
              </div>
            )}
            {section === "income" && (
              <div className="ed-body">
                <div className="ed-head"><h2 className="ed-title">Income</h2><div className="ed-head-tools"><ExpandCtl items={incomes} open={open} onExpand={expandAll} onCollapse={collapseAll} /><ClearAll count={incomes.length} onConfirm={clearIncomes} /><button className="add-btn" onClick={addInc}><Plus size={15} /> Add</button></div></div>
                {incomes.length === 0 && <p className="empty-note">No income yet. Add salary, rental, dividends or pension income with start and end dates.</p>}
                {incomes.map((i) => <StreamRow key={i.id} item={i} sym={sym} kind="income" ectx={ectx} inflation={assumptions.inflation} couple={couple} ownerOpts={ownerOpts} expanded={open.has(i.id)} onToggle={() => openSolo(i.id, incomes)} onChange={(p) => upInc(i.id, p)} onRemove={() => rmInc(i.id)} />)}
                <p className="ed-hint">End salary at "Retirement" and it tracks each person's retirement age. {couple ? "Set what happens to each income on that person's death." : ""}</p>

              </div>
            )}
            {section === "expenditure" && (
              <div className="ed-body">
                <div className="ed-head"><h2 className="ed-title">Expenditure</h2><div className="ed-head-tools"><ExpandCtl items={expenses} open={open} onExpand={expandAll} onCollapse={collapseAll} /><ClearAll count={expenses.length} onConfirm={clearExpenses} /><button className="add-btn" onClick={addExp}><Plus size={15} /> Add</button></div></div>
                {expenses.length === 0 && <p className="empty-note">No spending yet. Add essential and lifestyle costs — the gap between income and spending drives the whole plan.</p>}
                {expenses.map((e) => <StreamRow key={e.id} item={e} sym={sym} kind="expense" ectx={ectx} inflation={assumptions.inflation} couple={couple} ownerOpts={ownerOpts} expanded={open.has(e.id)} onToggle={() => openSolo(e.id, expenses)} onChange={(p) => upExp(e.id, p)} onRemove={() => rmExp(e.id)} />)}
                <p className="ed-hint">One-off and "every N years" cover ad-hoc costs. {couple ? "Joint costs step down to the survivor rate after a death; personal costs cease." : ""}</p>
              </div>
            )}
            {section === "liabilities" && (
              <div className="ed-body">
                <div className="ed-head"><h2 className="ed-title">Liabilities</h2><div className="ed-head-tools"><ExpandCtl items={liabilities} open={open} onExpand={expandAll} onCollapse={collapseAll} /><ClearAll count={liabilities.length} onConfirm={clearLiabilities} /><button className="add-btn" onClick={addLiab}><Plus size={15} /> Add</button></div></div>
                {liabilities.length === 0 && <p className="empty-note">No debts yet. Add a mortgage, BTL loan, or other borrowing — it reduces net worth and its repayments count as spending.</p>}
                {liabilities.map((L) => {
                  const expanded = open.has(L.id);
                  const ownerName = (ownerOpts.find((o) => o.value === (L.owner || "client1")) || {}).label || "";
                  return (
                    <div className={`rec ${expanded ? "open" : ""}`} key={L.id}>
                      <div className="rec-bar" role="button" tabIndex={0} onClick={() => openSolo(L.id, liabilities)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSolo(L.id, liabilities); } }}>
                        <span className="swatch" style={{ background: t.red }} />
                        <span className="rec-name-r">{L.name || "Untitled"}</span>
                        {couple && <span className="owner-chip">{ownerName}</span>}
                        <span className="rec-sum num">−{sym}{(Number(L.balance) || 0).toLocaleString()}</span>
                        <QuickDel onConfirm={() => rmLiab(L.id)} />
                        <ChevronDown size={15} className="chev" />
                      </div>
                      {expanded && (
                        <div className="rec-body">
                          <label className="flbl">Name</label>
                          <input className="rec-name" value={L.name} onChange={(e) => upLiab(L.id, { name: e.target.value })} placeholder="Name" />
                          {couple && <div className="rec-field"><label>Belongs to</label><Pick value={L.owner || "client1"} onChange={(v) => upLiab(L.id, { owner: v })} options={ownerOpts} /></div>}
                          <div className="rec-grid">
                            <div className="rec-field"><label>Type</label><Pick value={L.type} onChange={(v) => upLiab(L.id, { type: v })} options={LIAB_TYPES} /></div>
                            <div className="rec-field"><label>Outstanding balance</label><Money value={L.balance} symbol={sym} onChange={(v) => upLiab(L.id, { balance: v })} /></div>
                          </div>
                          <div className="rec-grid">
                            <div className="rec-field"><label>Interest rate <InfoTip text="The annual interest charged on the outstanding balance. The balance grows by this each year and is reduced by the repayments." /></label><Mini value={L.rate} step={0.1} suffix="%" onChange={(v) => upLiab(L.id, { rate: v })} /></div>
                            <div className="rec-field"><label>Monthly repayment</label><Money value={L.monthlyPayment} symbol={sym} onChange={(v) => upLiab(L.id, { monthlyPayment: v })} /></div>
                          </div>
                          {(Number(L.balance) || 0) > 0 && (Number(L.monthlyPayment) || 0) * 12 < (Number(L.balance) || 0) * (Number(L.rate) || 0) / 100 && (
                            <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 8, fontSize: 12, lineHeight: 1.4, color: "var(--amber, #b45309)" }}><AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> Monthly repayment is below the annual interest — at this balance the debt grows over time rather than reducing, so it never clears.</div>
                          )}
                          <button className="del-row" onClick={() => rmLiab(L.id)}><Trash2 size={13} /> Remove</button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <p className="ed-hint">Debts reduce net worth and their repayments are treated as spending each year. When a balance is cleared, the repayments stop automatically. The "net worth after debts" line on the chart shows the true balance-sheet position.</p>
              </div>
            )}
            {section === "protection" && (
              <div className="ed-body">
                <div className="ed-head"><h2 className="ed-title">Protection</h2><div className="ed-head-tools"><ExpandCtl items={protection} open={open} onExpand={expandAll} onCollapse={collapseAll} /><ClearAll count={protection.length} onConfirm={clearProtection} /><button className="add-btn" onClick={addPol}><Plus size={15} /> Add</button></div></div>
                {protection.length === 0 && <p className="empty-note">No policies yet. Add life cover to model what a lump sum on death would mean for the survivor's plan.</p>}
                {protection.map((p) => {
                  const expanded = open.has(p.id);
                  const insName = (ownerOpts.filter((o) => o.value !== "joint").find((o) => o.value === (p.insured || "client1")) || {}).label || "";
                  return (
                    <div className={`rec ${expanded ? "open" : ""}`} key={p.id}>
                      <div className="rec-bar" role="button" tabIndex={0} onClick={() => openSolo(p.id, protection)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSolo(p.id, protection); } }}>
                        <span className="swatch" style={{ background: t.accent }} />
                        <span className="rec-name-r">{p.name || "Untitled"}</span>
                        {couple && <span className="owner-chip">{insName}</span>}
                        <span className="rec-sum num">{sym}{(Number(p.sumAssured) || 0).toLocaleString()}</span>
                        <QuickDel onConfirm={() => rmPol(p.id)} />
                        <ChevronDown size={15} className="chev" />
                      </div>
                      {expanded && (
                        <div className="rec-body">
                          <label className="flbl">Name</label>
                          <input className="rec-name" value={p.name} onChange={(e) => upPol(p.id, { name: e.target.value })} placeholder="Name" />
                          {couple && <div className="rec-field"><label>Whose life is insured <InfoTip text="Life cover pays out when this person dies. In a couple, the lump sum lands in the survivor's plan." /></label><Pick value={p.insured || "client1"} onChange={(v) => upPol(p.id, { insured: v })} options={ownerOpts.filter((o) => o.value !== "joint")} /></div>}
                          <div className="rec-field"><label>Policy type <InfoTip text="Life cover pays the sum assured on death — it lands in the survivor's plan. Critical-illness cover pays on diagnosis, not death; model a claim with the CI scenario in Stress test." /></label><Seg value={p.ptype || "life"} onChange={(v) => upPol(p.id, { ptype: v })} options={[{ value: "life", label: "Life" }, { value: "ci", label: "Critical illness" }]} /></div>
                          <div className="rec-grid">
                            <div className="rec-field"><label>Sum assured <InfoTip text={(p.ptype || "life") === "ci" ? "The lump sum paid on a critical-illness claim. This is not paid on death — use the CI scenario in Stress test to model a claim." : "The lump sum paid out on death. In a couple it boosts the survivor's assets; for a single client it forms part of the estate."} /></label><Money value={p.sumAssured} symbol={sym} onChange={(v) => upPol(p.id, { sumAssured: v })} /></div>
                            <div className="rec-field"><label>Monthly premium</label><Money value={p.premium} symbol={sym} onChange={(v) => upPol(p.id, { premium: v })} /></div>
                          </div>
                          <div className="rec-field"><label>Cover until age <InfoTip text="Term assurance ends at this age — after it, premiums stop and there's no payout. For whole-of-life cover, set this high (e.g. 120)." /></label><Mini value={p.coverToAge} step={1} suffix={`(${insName || "insured"})`} onChange={(v) => upPol(p.id, { coverToAge: v })} /></div>
                          <button className="del-row" onClick={() => rmPol(p.id)}><Trash2 size={13} /> Remove</button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <p className="ed-hint">Premiums are treated as spending while cover is in force. On the insured's death within the term, the sum assured is paid into the household pot{couple ? " — you'll see the survivor's net worth step up" : ""}. Critical-illness policies pay on a claim, not on death — model a claim with the CI scenario in Stress test.</p>

                {protGap && (
                  <div className="pg-block">
                    <div className="ed-head"><h2 className="ed-title">Protection gap analysis</h2></div>
                    <label className="flbl">Rule-of-thumb benchmark <InfoTip text={`A widely used starting point: life cover of ${protMult.life}× annual income and critical-illness cover of ${protMult.ci}× annual income. Joint income is split equally between the couple. A benchmark is a conversation starter, not a needs analysis — the survivor test below is the real measure.`} /></label>
                    {protGap.bench.map((b) => (
                      <div className="pg-card" key={b.k}>
                        <div className="pg-card-name">{riskOwnerLabel(b.k)}<span className="pg-inc num"> · income {sym}{Math.round(b.inc).toLocaleString()}/yr</span></div>
                        <div className="pg-row"><span>Life cover — benchmark {protMult.life}×</span><span className="num">{fmtFull(b.lifeNeed, cur)}</span></div>
                        <div className="pg-row"><span>Life cover in force</span><span className="num">{fmtFull(b.lifeHave, cur)}</span></div>
                        <div className={`pg-row pg-verdict ${b.lifeGap > 0 ? "pg-gap" : "pg-ok"}`}><span>{b.lifeGap > 0 ? "Below benchmark by" : "Meets the benchmark"}</span><span className="num">{b.lifeGap > 0 ? fmtFull(b.lifeGap, cur) : "✓"}</span></div>
                        <div className="pg-row" style={{ marginTop: 6 }}><span>Critical illness — benchmark {protMult.ci}×</span><span className="num">{fmtFull(b.ciNeed, cur)}</span></div>
                        <div className="pg-row"><span>CI cover in force</span><span className="num">{fmtFull(b.ciHave, cur)}</span></div>
                        <div className={`pg-row pg-verdict ${b.ciGap > 0 ? "pg-gap" : "pg-ok"}`}><span>{b.ciGap > 0 ? "Below benchmark by" : "Meets the benchmark"}</span><span className="num">{b.ciGap > 0 ? fmtFull(b.ciGap, cur) : "✓"}</span></div>
                      </div>
                    ))}
                    <div className="pg-mult">
                      <span className="field-note">Benchmark multipliers (house assumptions, {onFirmSettingsChange ? "shared across your firm" : "saved on this device"}):</span>
                      <div className="pg-mult-row"><label>Life ×</label><Mini value={protMult.life} step={1} onChange={(v) => upProtMult({ life: v })} /><label>CI ×</label><Mini value={protMult.ci} step={1} onChange={(v) => upProtMult({ ci: v })} /></div>
                    </div>

                    {couple && protGap.survivor && (
                      <div className="pg-surv">
                        <label className="flbl" style={{ marginTop: 14 }}>Survivor test <InfoTip text="The real measure. The engine re-runs the whole plan assuming death at the age you choose: income stops, the survivor's spending adjusts, assets transfer, and any in-term life cover pays out. If the survivor's plan runs short, the figure shown is the additional lump sum at death that would keep it funded — computed by the engine, not a rule of thumb." /></label>
                        {protGap.survivor.map((sv) => {
                          const ess = !!survEss[sv.k];
                          const setDA = (v) => { const na = Math.min(sv.maxAge, Math.max(sv.minAge, Math.round(Number(v) || sv.minAge))); setDeathAges((d) => ({ ...d, [sv.k]: na })); setSurvivorOverlay((ov) => (ov && ov.owner === sv.k ? { ...ov, deathAge: na } : ov)); };
                          // Verdict reflects the selected spending mode (full lifestyle vs essentials-only floor).
                          const vFunded = ess ? sv.essFunded : sv.funded;
                          const vShortYear = ess ? sv.essFirstShortYear : sv.firstShortYear;
                          const vShortTotal = ess ? sv.essTotalShortReal : sv.totalShortReal;
                          const vCloseGap = ess ? sv.essCloseGap : sv.closeGap;
                          return (
                          <div className="pg-card" key={sv.k}>
                            <div className="pg-card-name">If {riskOwnerLabel(sv.k)} died at age <Mini value={sv.dAge} step={1} onChange={setDA} /></div>
                            <div className="pg-surv-slider"><RangeInput min={sv.minAge} max={sv.maxAge} step={1} value={sv.dAge} onChange={setDA} aria-label="Death age" /><span className="pg-surv-ages">{sv.minAge}–{sv.maxAge}</span></div>
                            {sv.hasDisc && <div className="pg-surv-mode"><Seg value={ess ? "ess" : "full"} onChange={(v) => setSurvEss((d) => ({ ...d, [sv.k]: v === "ess" }))} options={[{ value: "full", label: "Full spending" }, { value: "ess", label: "Essentials only" }]} /></div>}
                            <div className="pg-row"><span>Existing life cover paying out</span><span className="num">{fmtFull(sv.payout, cur)}</span></div>
                            {vFunded ? (
                              <div className="pg-row pg-verdict pg-ok"><span>Survivor's plan stays funded to the end{ess ? " on essentials" : ""}</span><span className="num">✓</span></div>
                            ) : (<>
                              <div className="pg-row pg-verdict pg-gap"><span>Survivor's plan runs short from {vShortYear}{ess ? " even on essentials" : ""}</span><span className="num">−{fmtFull(vShortTotal, cur)} total</span></div>
                              <div className="pg-row pg-close"><span>Additional cover that closes the gap</span><span className="num">{vCloseGap === Infinity ? "Beyond " + fmtFull(20000000, cur) : "~" + fmtFull(Math.ceil(vCloseGap / 10000) * 10000, cur)}</span></div>
                            </>)}
                            {sv.hasDisc && !ess && !sv.funded && (
                              <div className="pg-surv-range">{sv.essFunded ? <>On essentials only, the survivor's plan stays funded for life — the shortfall is in discretionary lifestyle spending, not core needs.</> : <>Even trimmed to essentials, the plan runs short from {sv.essFirstShortYear}{sv.essTotalShortReal > 0 ? <> (−{fmtFull(sv.essTotalShortReal, cur)} total)</> : null} — this gap is in core spending.</>}</div>
                            )}
                        {(() => { const isActive = survivorOverlay && survivorOverlay.owner === sv.k && survivorOverlay.deathAge === sv.dAge && !!survivorOverlay.essentialOnly === ess; return isActive ? (<button className="pg-chart-btn pg-chart-btn-on" onClick={() => setSurvivorOverlay(null)}>× Clear from chart</button>) : (<button className="pg-chart-btn" onClick={() => applySurvivor({ owner: sv.k, deathAge: sv.dAge, essentialOnly: ess })}>↗ Show on chart{ess ? " (essentials)" : ""}</button>); })()}
                          </div>
                          );
                        })}
                        <span className="field-note">Shortfall totals are in today's money. "Closes the gap" is the smallest lump sum at death under which no year shows a shortfall — an analysis of this plan, not a recommendation.</span>
                      </div>
                    )}
                    {!couple && <span className="field-note">The survivor test applies to couples. For a single client, the benchmark above plus liabilities and estate intentions frame the conversation.</span>}
                  </div>
                )}
              </div>
            )}
            {section === "notes" && (
              <div className="ed-body">
                <h2 className="ed-title">Adviser notes</h2>
                <div className="notes-tools"><button className="xc-btn" onClick={() => setAdviserNotes((n) => (n ? n.replace(/\s*$/, "") + "\n\n" : "") + new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) + " — ")}>+ Insert today's date</button></div>
                <textarea
                  className="notes-area"
                  value={adviserNotes}
                  onChange={(e) => setAdviserNotes(e.target.value)}
                  placeholder={"Meeting notes, rationale, follow-ups…\n\ne.g. 12 Jun — agreed Balanced for Sara, review BTL sale at next annual review. Client wants school fees modelled from 2028."}
                />
                <p className="ed-hint">Internal to you — saved with the plan but never shown in client view or the report. Use it for suitability rationale, review reminders, and anything you'd otherwise lose in a notebook.</p>
              </div>
            )}
            {section === "scenarios" && (
              <div className="ed-body">
                <div className="ed-head"><h2 className="ed-title">Scenarios</h2>{onScenarioAction && <button className="add-btn" onClick={() => onScenarioAction({ type: "create", name: null, data: { profile, assumptions, assets, incomes, expenses, liabilities, protection, annotations, adviserNotes } })}><Plus size={15} /> New from current</button>}</div>
                {!onScenarioAction && <p className="empty-note">Scenario management is available in the full app with a signed-in adviser account.</p>}
                {onScenarioAction && (scenarios || []).map((sc) => {
                  const isActive = sc.id === activeScenarioId;
                  const isCompare = sc.id === compareScenarioId;
                  return (
                    <div className={`scen-row ${isActive ? "on" : ""}`} key={sc.id}>
                      <input className="scen-name" key={`${sc.id}-${sc.name}`} defaultValue={sc.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== sc.name) onScenarioAction({ type: "rename", id: sc.id, name: v }); }} onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} />
                      {isActive ? <span className="scen-chip scen-chip-on">Editing</span> : <button className="scen-btn" onClick={() => onScenarioAction({ type: "switch", id: sc.id })}>Open</button>}
                      {!isActive && <button className={`scen-btn ${isCompare ? "scen-btn-cmp" : ""}`} onClick={() => onScenarioAction({ type: "compare", id: isCompare ? null : sc.id })}>{isCompare ? "✓ Comparing" : "Compare"}</button>}
                      {!isActive && (scenarios || []).length > 1 && <button className="scen-del" onClick={() => onScenarioAction({ type: "delete", id: sc.id })}><Trash2 size={13} /></button>}
                    </div>
                  );
                })}
                {onScenarioAction && <p className="ed-hint">"New from current" copies this plan as a starting point — e.g. duplicate the current situation, then build the proposed solution in the copy. "Compare" overlays the other scenario's net worth on the chart as a dashed line so the client sees both paths at once.</p>}
              </div>
            )}
          </section>
        )}

        <main className="chartwrap">
          <div className="stats">
            <Stat label="Net worth today" value={fmtCompact(kpis.currentTotal, cur)} sub={couple ? `${fn1} ${ectx.age0c1} (${baseYear}) · ${fn2} ${ectx.age0c2} (${baseYear})` : `age ${ectx.age0c1} (${baseYear})`} />
            <Stat label={kpis.s ? "At retirement · scenario" : "At retirement"} value={fmtCompact(kpis.s ? kpis.s.atRetirement : kpis.atRetirement, cur)} sub={kpis.s ? `base ${fmtCompact(kpis.atRetirement, cur)}` : (ectx.retC1 <= ectx.age0c1 ? "retired" : `${fn1} age ${ectx.retC1}`)} tone={kpis.s && kpis.s.atRetirement < kpis.atRetirement ? "red" : undefined} />
            <Stat label={kpis.s ? "Left at plan end · scenario" : "Left at plan end"} value={fmtCompact(kpis.s ? kpis.s.endVal : kpis.endVal, cur)} sub={kpis.s ? `base ${fmtCompact(kpis.endVal, cur)}` : `in ${kpis.endYear}`} tone={kpis.s && kpis.s.endVal < kpis.endVal ? "red" : undefined} />
            <Stat label={kpis.s ? "Plan longevity · scenario" : "Plan longevity"} value={(kpis.s ? kpis.s.depletionAge : kpis.depletionAge) === null ? "Fully funded" : `Age ${kpis.s ? kpis.s.depletionAge : kpis.depletionAge}`} sub={kpis.s ? ((kpis.s.depletionAge === null ? "holds under scenario" : "funds short under scenario")) : (kpis.depletionAge === null ? `to ${kpis.endYear}` : kpis.depName ? `${kpis.depName} · spendable funds short` : "spendable funds run short")} tone={kpis.s ? kpis.s.tone : kpis.tone} />
          </div>

          <div className={`banner banner-${banner.tone}`}><banner.Icon size={17} /><span>{banner.text}</span></div>

          <div className="chart-card">
            <div className="chart-head">
              <div><div className="chart-title">Net worth over time</div><div className="chart-sub">to {kpis.endYear} · {cur} · {showReal ? "today's money — what these amounts are worth now" : "future money — the actual amounts paid in each year"}{couple ? " · couple" : ""}{survivorOverlay ? <> · <InfoTip text="The chart shows net worth at the start of each age-year, before that year's cashflows are processed. Death at a given age takes effect in the following year's snapshot — income and contributions stop, cover pays in, and survivor spending adjusts. This means the divergence between the two lines typically appears one to two years after the death age shown." /></> : null}</div>{compareMap && (() => { const last = [...data].reverse().find((d) => d.cmp != null); const delta = last ? last.cmp - last.netWorth : null; const showTax = lifetimeTax > 0 || (compareMap.lifeTax || 0) > 0; return <div className="chart-cmp"><i /> Comparing with <b>{compareName || "scenario"}</b>{delta != null ? <> · at {last.year}: {delta >= 0 ? "+" : "−"}{fmtFull(Math.abs(delta), cur)} {delta >= 0 ? "ahead" : "behind"}</> : null}{showTax ? <> · lifetime tax {fmtFull(compareMap.lifeTax || 0, cur)} vs {fmtFull(lifetimeTax, cur)} here</> : null}{onScenarioAction && <button className="chart-cmp-x" onClick={() => onScenarioAction({ type: "compare", id: null })}>×</button>}</div>; })()}</div>
              {!present && (
                <div className="head-toggles">
                  <div className="view-seg"><button className={chartView === "composition" ? "on" : ""} onClick={() => setChartView("composition")}>Composition</button><button className={chartView === "networth" ? "on" : ""} onClick={() => setChartView("networth")}>Total</button></div>
                  <div className="view-seg"><button className={moneyMode === "real" ? "on" : ""} onClick={() => setMoneyMode("real")}>Today's {sym}</button><button className={moneyMode === "nominal" ? "on" : ""} onClick={() => setMoneyMode("nominal")}>Future {sym}</button></div>
                  <button className="goal-btn" onClick={() => setGoalOpen(true)}><Target size={14} /> What if…</button>
                  <button className={`goal-btn ${stress || ci ? "on" : ""}`} onClick={() => setStressOpen(true)}><AlertTriangle size={14} /> Stress test</button>
                  <button className="goal-btn" onClick={() => setMcOpen(true)}><Activity size={14} /> Confidence</button>
                </div>
              )}
            </div>
            <div className="legend">
              {showComposition && legendTypes.map((ty) => <span key={ty}><i style={{ background: typeSwatch(ty) }} /> {TYPE_LABEL[ty]}</span>)}
              {hasProperty && <span><i className="line-key dash" style={{ borderTopColor: t.line }} /> Spendable (excl. property)</span>}
              {hasDebt && showComposition && <span><i className="line-key" style={{ borderTopColor: t.ink }} /> Net worth after debts</span>}
              {(stress || ci || survivorOverlay) && <span><i className="line-key dash" style={{ borderTopColor: t.ink, opacity: 0.55 }} /> Current plan (for comparison)</span>}
              {compareMap && <span><i className="line-key" style={{ borderTopColor: "hsl(185 70% 42%)" }} /> {compareName || "Compared scenario"}</span>}
            </div>
            {(eventList.length > 0 || annotations.length > 0 || !present) && (
              <div className="chart-events">
                {eventList.map((e, i) => <span key={i} className="evchip"><i style={{ color: e.color }} />{e.label}<b className="num">{e.year}</b></span>)}
                {payoutEvents.map((e, i) => <span key={`p${i}`} className="evchip inflow" style={{ borderColor: e.color }}><i style={{ color: e.color }} />{e.label}<b className="num">{e.year}</b></span>)}
                {annotations.map((a, i) => (present
                  ? <span key={a.id} className="evchip note" style={{ borderColor: noteColor(i) }}><FileText size={11} color={noteColor(i)} />{a.text || "Note"}<b className="num">{a.year}</b></span>
                  : <span key={a.id} className="evchip note" style={{ borderColor: noteColor(i) }}><FileText size={11} color={noteColor(i)} /><input className="note-txt" value={a.text} placeholder="note…" onChange={(e) => upAnnotation(a.id, { text: e.target.value })} /><input className="note-yr num" type="number" value={a.year} onChange={(e) => upAnnotation(a.id, { year: e.target.value })} /><button className="note-x" onClick={() => rmAnnotation(a.id)}>×</button></span>))}
                {!present && <button className="ev-add" onClick={addAnnotation}><Plus size={12} /> note</button>}
              </div>
            )}
            {(stress || ci) && stressImpact && (
              <div className="stress-bar">
                <span className="stress-tag"><AlertTriangle size={12} /> {stressImpact.label}</span>
                <span className="stress-impact">{stressImpact.stressAge ? `funds run short at ${stressImpact.stressAge}` : "still funded for life"}{stressImpact.baseAge !== stressImpact.stressAge ? ` · base ${stressImpact.baseAge ?? "fully funded"}` : ""}</span>
                {stress && stressCfg.timing === "retirement" && stressById(stress)?.timingable && <span className="stress-impact" style={{opacity:0.7}}>· pot at retirement shows pre-shock value — impact visible in subsequent years</span>}
                <button className="wi-reset" onClick={clearScenario}>Clear</button>
              </div>
            )}
            {survivorOverlay && survivorSummary && (() => {
              const s = survivorSummary;
              return (
                <div className="stress-bar stress-bar-surv">
                  <span className="stress-tag"><AlertTriangle size={12} /> {s.diedName} dies age {s.deathAge}</span>
                  <span className="stress-impact">
                    {s.survFundedAge ? <b>{s.survName}'s plan runs short at {s.survFundedAge}</b> : <b>{s.survName}'s plan stays funded for life</b>}
                    {" · "}net worth at plan end {s.total >= 0 ? `+${fmtFull(s.total, cur)} vs both alive` : `${fmtFull(Math.abs(s.total), cur)} less than if both survived`}
                    {s.cover > 0 ? ` — cover adds ${fmtFull(Math.abs(s.coverEffect), cur)}` : " — no cover pays out"}
                    {`, lower survivor spending less lost earnings ${s.deathEffect >= 0 ? "+" : "−"}${fmtFull(Math.abs(s.deathEffect), cur)}`}
                  </span>
                  {s.deathEffect >= 0 && s.total >= 0 && (
                    <span className="stress-note"><InfoTip text={`The survivor's plan is projected to be better off than the base plan — the ${100 - (Number(assumptions.survivorExpenseFactor) || 67)}% reduction in ongoing joint spending outweighs ${s.diedName}'s lost income. This is financially correct given the income and spending assumptions entered, but worth discussing carefully in context: the model reflects economics, not the full picture of what losing a partner means.`} /> This result is financially correct — reduced spending outweighs lost earnings</span>
                  )}
                  <button className="wi-reset" onClick={() => setSurvivorOverlay(null)}>Clear</button>
                </div>
              );
            })()}
            {!present && (
              <div className={`whatif ${whatIfActive ? "active" : ""}`}>
                <div className="whatif-head">
                  <span className="whatif-title"><SlidersHorizontal size={13} /> What-if</span>
                  {whatIfActive ? <span className="wi-badge">adjusted view — not saved</span> : <span className="wi-hint">drag to test the plan live</span>}
                  {whatIfActive && <button className="wi-reset" onClick={resetWhatIf}>Reset</button>}
                </div>
                <div className="wi-sliders">
                  <WhatIfSlider label="Growth" value={whatIf.growth} min={-4} max={4} step={0.5} fmt={(v) => (v > 0 ? `+${v}%` : v < 0 ? `${v}%` : "base")} onChange={(v) => setWhatIf((w) => ({ ...w, growth: v }))} />
                  <WhatIfSlider label="Inflation" value={whatIf.inflation} min={-2} max={4} step={0.5} fmt={(v) => (v > 0 ? `+${v}%` : v < 0 ? `${v}%` : "base")} onChange={(v) => setWhatIf((w) => ({ ...w, inflation: v }))} />
                  <WhatIfSlider label="Longevity" value={whatIf.life} min={-10} max={15} step={1} fmt={(v) => (v > 0 ? `+${v} yrs` : v < 0 ? `${v} yrs` : "base")} onChange={(v) => setWhatIf((w) => ({ ...w, life: v }))} />
                </div>
              </div>
            )}
            <div className="chart-main">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={chartMargin}>
                  <defs><linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={t.netFill} stopOpacity={0.5} /><stop offset="100%" stopColor={t.netFill} stopOpacity={0.04} /></linearGradient></defs>
                  <CartesianGrid stroke={t.grid} vertical={false} />
                  <XAxis dataKey="year" tick={false} axisLine={false} tickLine={false} height={4} />
                  <YAxis width={axisWidth} tick={tick} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCompact(v, cur)} />
                  <Tooltip content={<CompTip />} cursor={{ stroke: t.borderStrong, strokeWidth: 1 }} position={{ y: 10 }} />

                  {markers.retC1 && !(survivorOverlay && survivorOverlay.owner === "client1") && <ReferenceLine x={markers.retC1} stroke={t.ink} strokeDasharray="4 3" strokeWidth={1.4} strokeOpacity={0.8} />}
                  {markers.retC2 && !(survivorOverlay && survivorOverlay.owner === "client2") && <ReferenceLine x={markers.retC2} stroke={t.ink} strokeDasharray="4 3" strokeWidth={1.4} strokeOpacity={0.8} />}
                  {survivorOverlay
                    ? <ReferenceLine x={baseYear + (survivorOverlay.deathAge - (survivorOverlay.owner === "client2" ? ectx.age0c2 : ectx.age0c1))} stroke={t.red} strokeDasharray="3 3" strokeWidth={1.8} strokeOpacity={0.9} />
                    : markers.firstDeath && <ReferenceLine x={markers.firstDeath} stroke={t.mid} strokeDasharray="2 4" strokeWidth={1.4} strokeOpacity={0.8} />}
                  {kpis.depYear && <ReferenceLine x={kpis.depYear} stroke={t.red} strokeDasharray="4 3" strokeWidth={1.5} strokeOpacity={0.9} />}
                  {payoutEvents.map((e, i) => <ReferenceLine key={`pl${i}`} x={e.year} stroke={t.green} strokeDasharray="2 3" strokeWidth={1.4} strokeOpacity={0.85} />)}
                  {showComposition
                    ? stackOrder.map((a) => <Area key={a.id} type="monotone" dataKey={(stress || ci || survivorOverlay) ? "s_" + aKey(a.id) : aKey(a.id)} stackId="nw" stroke={colors[a.id]} strokeWidth={0.8} fill={colors[a.id]} fillOpacity={0.88} isAnimationActive={false} />)
                    : <Area type="monotone" dataKey={(stress || ci || survivorOverlay) ? "stressed" : "netWorth"} stroke={t.netStroke} strokeWidth={2.4} fill="url(#nwFill)" dot={false} isAnimationActive={false} />}
                  {(stress || ci || survivorOverlay) && <Area type="monotone" dataKey={(d) => Math.max(0, d.stressed || 0)} stackId="sgap" stroke="none" fill="none" isAnimationActive={false} legendType="none" tooltipType="none" />}
                  {(stress || ci || survivorOverlay) && <Area type="monotone" dataKey={(d) => Math.max(0, (d.netWorth || 0) - Math.max(0, d.stressed || 0))} stackId="sgap" stroke="none" fill={t.red} fillOpacity={0.12} isAnimationActive={false} legendType="none" tooltipType="none" />}
                  {hasProperty && <Line type="monotone" dataKey={(stress || ci || survivorOverlay) ? "sInvestable" : "investable"} stroke={t.line} strokeWidth={1.6} strokeDasharray="5 3" dot={false} isAnimationActive={false} />}
                  {hasDebt && showComposition && <Line type="monotone" dataKey={(stress || ci || survivorOverlay) ? "stressed" : "netWorth"} stroke={t.ink} strokeWidth={1.8} dot={false} isAnimationActive={false} />}
                  {(stress || ci || survivorOverlay) && <Line type="monotone" dataKey="netWorth" stroke={t.ink} strokeWidth={1.6} strokeDasharray="9 5" strokeOpacity={0.55} dot={false} isAnimationActive={false} />}
                  {nwHasNeg && <Area type="monotone" dataKey={(stress || ci || survivorOverlay) ? "sNeg" : "nwNeg"} baseValue={0} stroke="none" fill={t.red} fillOpacity={0.22} isAnimationActive={false} />}
                  {nwHasNeg && <ReferenceLine y={0} stroke={t.red} strokeWidth={1.2} strokeOpacity={0.7} />}
                  {compareMap && <Line type="monotone" dataKey="cmp" stroke={t.panel} strokeWidth={5} dot={false} isAnimationActive={false} />}
                  {compareMap && <Line type="monotone" dataKey="cmp" stroke="hsl(185 80% 44%)" strokeWidth={2.6} dot={false} isAnimationActive={false} />}
                  {annotations.map((a, i) => (a.year ? <ReferenceLine key={a.id} x={Number(a.year)} stroke={noteColor(i)} strokeDasharray="5 4" strokeOpacity={0.85} strokeWidth={1.5} /> : null))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="cash-head">
              <div className="cash-title">Money in vs money out<span>{stress || ci || survivorOverlay ? (survivorOverlay ? `survivor plan — ${survivorOverlay.owner === "client2" ? fn2 : fn1} dies age ${survivorOverlay.deathAge}${survivorOverlay.essentialOnly ? " · essentials only" : ""}` : "showing the stressed scenario — income/spending under the shock") : "each year · hover for the breakdown by source"}</span></div>
              <div className="legend sm">
                <span><i style={{ background: INCOME_LEGEND }} /> Income</span>
                {hasPlannedDraw && <span><i style={{ background: DRAWDOWN_COLOR }} /> Planned drawdown</span>}
                {data.some((d) => (d.coveredBySavings || 0) > 0) && <span><i style={{ background: t.amber }} /> Drawn from savings</span>}
                {data.some((d) => (d.uncovered || 0) > 0) && <span><i style={{ background: t.red }} /> Shortfall</span>}
                <span><i className="line-key" style={{ borderTopColor: t.ink }} /> Expenses</span>
                {hasContrib && <span><i className="line-key dash" style={{ borderTopColor: t.mid }} /> + savings/contributions</span>}
                {tax.enabled && <span className="legend-tax-badge">Tax on withdrawals active</span>}
              </div>
            </div>
            <div className="chart-cash">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={chartMargin}>
                  <CartesianGrid stroke={t.grid} vertical={false} />
                  <YAxis width={axisWidth} tick={tick} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCompact(v, cur)} />
                  <XAxis dataKey="year" tick={tick} axisLine={{ stroke: t.border }} tickLine={false} interval={xInterval} />
                  {markers.retC1 && !(survivorOverlay && survivorOverlay.owner === "client1") && <ReferenceLine x={markers.retC1} stroke={t.ink} strokeDasharray="4 3" strokeWidth={1.4} strokeOpacity={0.8} />}
                  {markers.retC2 && !(survivorOverlay && survivorOverlay.owner === "client2") && <ReferenceLine x={markers.retC2} stroke={t.ink} strokeDasharray="4 3" strokeWidth={1.4} strokeOpacity={0.8} />}
                  {survivorOverlay && <ReferenceLine x={baseYear + (survivorOverlay.deathAge - (survivorOverlay.owner === "client2" ? ectx.age0c2 : ectx.age0c1))} stroke={t.red} strokeDasharray="3 3" strokeWidth={1.8} strokeOpacity={0.9} />}
                  <Tooltip content={<FlowTip />} cursor={{ fill: t.grid }} position={{ y: 10 }} />
                  {incomes.map((i) => <Bar key={i.id} dataKey={iKey(i.id)} stackId="mio" fill={incColors[i.id]} fillOpacity={0.9} isAnimationActive={false} />)}
                  {hasPlannedDraw && <Bar dataKey="plannedDraw" stackId="mio" fill={DRAWDOWN_COLOR} fillOpacity={0.92} isAnimationActive={false} />}
                  <Bar dataKey="coveredBySavings" stackId="mio" fill={t.amber} fillOpacity={0.85} isAnimationActive={false} />
                  <Bar dataKey="uncovered" stackId="mio" fill={t.red} fillOpacity={0.9} isAnimationActive={false} radius={[2, 2, 0, 0]} />
                  <Line type="monotone" dataKey="expenditure" stroke={t.line} strokeWidth={2} dot={false} isAnimationActive={false} />
                  {hasContrib && <Line type="monotone" dataKey="outgoings" stroke={t.mid} strokeWidth={1.4} strokeDasharray="5 3" dot={false} isAnimationActive={false} />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Cash gap — the plan in three phases, always visible */}
          {planPhases && cashGap && (
            <div className="gap-card">
              <div className="gap-head">
                <span className="gap-title">Cash gap <InfoTip text="Your plan in phases. Green: income covers spending. Amber: spending exceeds income and the difference is drawn from savings — normal in retirement; the question is whether the pots last. Red: the gap can no longer be met from income or accessible savings." /></span>
                <span className="gap-sub">{stress || ci || survivorOverlay
                  ? survivorOverlay
                    ? `survivor plan — ${survivorOverlay.owner === "client2" ? fn2 : fn1} dies age ${survivorOverlay.deathAge}${survivorOverlay.essentialOnly ? " · essentials only" : ""}`
                    : ci
                      ? `CI scenario — ${ci.owner === "client2" ? fn2 : fn1} age ${ci.age}`
                      : stressImpact ? stressImpact.label : "stress scenario"
                  : showReal ? "today's money" : "future money"}</span>
              </div>
              <div className="gap-strip">
                {planPhases.segs.map((sg, i) => (
                  <div key={i} className={`gap-seg gap-${sg.phase}`} style={{ flexGrow: sg.n }} title={`${sg.fromYear}–${sg.toYear}`}>
                    {sg.n / planPhases.total > 0.13 && <span className="gap-seg-lbl">{sg.phase === "ok" ? "Income covers spending" : sg.phase === "draw" ? "Drawing from savings" : "Gap unmet"}</span>}
                    {sg.n / planPhases.total > 0.07 && <span className="gap-seg-yrs num">{sg.fromYear}{sg.n > 1 ? `–${sg.toYear}` : ""}</span>}
                  </div>
                ))}
              </div>
              <div className="gap-stats">
                {cashGap.none && <span className="gap-stat gap-stat-ok">✓ Income covers spending in every year — savings are never drawn upon</span>}
                {cashGap.oneOffOnly && <span className="gap-stat">Savings used only for one-off costs ({cashGap.isolatedYears.join(", ")}) · largest {fmtFull(cashGap.peakDraw, cur)}</span>}
                {!cashGap.none && !cashGap.oneOffOnly && (<>
                  <span className="gap-stat">Drawdown starts <b className="num">{cashGap.firstYear}</b>{(() => { const yrs = cashGap.firstYear - new Date().getFullYear(); return yrs > 0 ? ` — in ${yrs} year${yrs === 1 ? "" : "s"}` : " — already underway"; })()}</span>
                  <span className="gap-stat">Typical draw <b className="num">~{fmtFull(cashGap.avgDraw, cur)}/yr</b></span>
                  <span className="gap-stat">Total drawn <b className="num">{fmtFull(cashGap.totalDrawn, cur)}</b></span>
                </>)}
                {cashGap.uncoveredCount > 0 && <span className="gap-stat gap-stat-red">⚠ {cashGap.uncoveredCount} year{cashGap.uncoveredCount === 1 ? "" : "s"} unmet from {cashGap.firstUncoveredYear}</span>}
              </div>
            </div>
          )}
        </main>
        {goalOpen && goal && (() => {
          const ret1 = Number(profile.client1.retirementAge) || 0;
          const m = (v) => fmtFull(v, cur);
          const smile = (assumptions.spendingPattern || {}).mode === "smile";
          // The solvers run through projectCashflow with the full assumptions, so they already apply the
          // retirement smile when it's on. The note must say so, rather than claiming flat spending.
          const spendBasisNote = smile
            ? "Spending follows your retirement-smile pattern — lifestyle (discretionary) spend eases in later retirement, which the solver applies. Essentials are unchanged."
            : "Spending is assumed constant over time — if you'd naturally cut back in later retirement, the true figure is more favourable.";
          const cushionPhrase = "even if investment returns came in 1 point lower than assumed";
          const cushionNote = "The cushion here is a 1-point shortfall in investment returns across all assets, so the answer has room to spare rather than only just working. Longevity is covered separately by the \u201Clive to 100\u201D card below.";
          const yearsPhrase = (d) => d < 0 ? `about ${Math.abs(d)} year${Math.abs(d) === 1 ? "" : "s"} sooner than planned` : d > 0 ? `about ${d} year${d === 1 ? "" : "s"} later than planned` : "at the planned age";
          const cards = [];

          if (goal.fundedNow) {
            // SPENDING
            const pctMore = goal.spend != null ? ((goal.spend - 1) * 100).toFixed(1) : null;
            if (goal.maxSpendSafe != null && goal.curSpend > 0) {
              const safe = goal.maxSpendSafe, edge = goal.maxSpend, curS = goal.curSpend, pm = (safe / curS - 1) * 100;
              if (safe >= curS)
                cards.push({ Icon: Receipt, verdict: "head", q: "How much can I spend each year?", text: `Up to about ${m(safe)} a year in today's money${pm < 1 ? ` — about the same as your current ${m(curS)}` : pm < 400 ? ` — roughly ${pm.toFixed(0)}% more than the current ${m(curS)}` : ` — well above the current ${m(curS)}`}, with the plan still funded for life ${cushionPhrase}.`, note: `Single-lever answer: retirement age, growth rates and contributions are held constant. ${cushionNote} The absolute ceiling, with no cushion at all, is about ${m(edge)} a year. ${spendBasisNote}` });
              else
                cards.push({ Icon: Receipt, verdict: "head", q: "How much can I spend each year?", text: `Today's spending of about ${m(curS)} a year funds the plan, but with little safety margin. For a cushion — funded ${cushionPhrase} — spending would sit around ${m(safe)} a year.`, note: `Single-lever answer: retirement age, growth rates and contributions are held constant. ${cushionNote} The plan still funds for life on spending up to about ${m(edge)} a year, but that leaves no room if markets disappoint. ${spendBasisNote}` });
            } else if (goal.maxSpend != null && goal.curSpend > 0)
              cards.push({ Icon: Receipt, verdict: "head", q: "How much can I spend each year?", text: `Up to about ${m(goal.maxSpend)} a year in today's money and the plan still lasts for life — though with no safety cushion; even a 1-point shortfall in returns would put it under pressure.`, note: `Single-lever answer: all other inputs held constant. No spending level holds the full cushion here — the constraint is the asset and income base, not spending. ${spendBasisNote}` });
            else
              cards.push({ Icon: Receipt, verdict: "head", q: "How much can I spend each year?", text: `Spending could rise by about ${pctMore}% and the plan would still last for life.`, note: "All other inputs held constant." });

            // RETIREMENT
            const retSpendBasis = smile ? "Spending follows your retirement-smile pattern (lifestyle eases in later life), which the solver applies." : "Assumes spending stays at today's level through retirement (no lifestyle reduction).";
            const edgeAge = goal.earliestRetAge != null ? `age ${goal.earliestRetAge}` : "the planned age";
            if (goal.retireSafe != null && goal.retireSafe < 0)
              cards.push({ Icon: User, verdict: "head", q: "When can I afford to retire?", text: `As early as age ${goal.earliestRetAgeSafe}${couple ? " each" : ""} — ${yearsPhrase(goal.retireSafe)} — with the plan still funded for life ${cushionPhrase}.`, note: `${cushionNote} The earliest age the plan funds with no cushion at all is ${edgeAge}${goal.retire != null ? ` (${yearsPhrase(goal.retire)})` : ""}. ${retSpendBasis} Income sources follow your plan exactly as entered.` });
            else if (goal.retireSafe === 0)
              cards.push({ Icon: User, verdict: "head", q: "When can I afford to retire?", text: `Retiring at the planned age (${goal.earliestRetAgeSafe})${couple ? " each" : ""} holds up with a safety margin — funded for life ${cushionPhrase}.${goal.retire != null && goal.retire < 0 ? ` You could go as early as ${edgeAge} if you accept no cushion.` : ""}`, note: `${cushionNote} ${retSpendBasis} Income sources follow your plan exactly as entered.` });
            else if (goal.retireSafe != null)
              cards.push({ Icon: User, verdict: "info", q: "When can I afford to retire?", text: `The planned age funds the plan, but with little margin. For a cushion — funded ${cushionPhrase} — retiring around age ${goal.earliestRetAgeSafe} (${yearsPhrase(goal.retireSafe)}) gives room to spare.`, note: `${cushionNote} The plan still funds at break-even from ${edgeAge}, but with no margin if markets disappoint. ${retSpendBasis}` });
            else
              cards.push({ Icon: User, verdict: "info", q: "When can I afford to retire?", text: `Even retiring substantially later doesn't secure a full safety cushion within the dates tested — the constraint is the asset and income base, not the retirement date.`, note: `${cushionNote} The plan may still fund at break-even from the planned age; this card is about having room to spare.` });

            // RETURNS
            if (goal.growthCapped)
              cards.push({ Icon: TrendingUp, verdict: "head", q: "What if my investments underperform?", text: "Returns could fall by more than 12 percentage points across all assets and the plan would still last — a very large cushion.", note: "Applies a uniform shift to every asset's growth rate simultaneously. Real portfolios vary by asset class." });
            else if (goal.growth != null)
              cards.push({ Icon: TrendingUp, verdict: "head", q: "What if my investments underperform?", text: `Returns could be up to ${Math.abs(goal.growth).toFixed(1)} percentage points lower across all assets and the plan would still last for life.`, note: "Applies a uniform downward shift to every asset simultaneously — a blunt but useful stress test. Individual asset underperformance could vary." });

            // INFLATION
            if (goal.inflCapped)
              cards.push({ Icon: TrendingUp, verdict: "head", q: "What if inflation runs higher?", text: `The plan is highly resilient to inflation — even sustained inflation well above the assumed ${goal.baseInfl}% a year wouldn't break it.`, note: "Higher inflation pushes up spending each year (and any inflation-linked costs), while incomes only keep pace if you've set them to escalate. Fixed incomes lose ground fastest. A blunt average-inflation test, not a year-by-year forecast." });
            else if (goal.inflMax != null)
              cards.push({ Icon: TrendingUp, verdict: "head", q: "What if inflation runs higher?", text: `Average inflation could run up to about ${(goal.baseInfl + goal.inflMax).toFixed(1)}% a year — roughly ${goal.inflMax.toFixed(1)} point${goal.inflMax >= 1.5 ? "s" : ""} above the ${goal.baseInfl}% assumed — and the plan would still last for life.`, note: "Higher inflation raises spending each year while fixed incomes lose ground. Incomes you've set to escalate with inflation keep pace; those set flat don't — they're the most exposed. Tests average inflation across the whole plan." });

            // ONE-OFF — liquid-only, with a safe figure and an absolute ceiling, each explained.
            if (goal.oneOff != null) {
              const oo = goal.oneOff;
              // When the ceiling equals the whole liquid pool, the plan never actually fails within reach —
              // the limit is simply how much accessible cash exists, not a depletion point. Word it honestly.
              const maxCapped = oo.max >= oo.liquidToday - 1;
              if (oo.liquidToday <= 0)
                cards.push({ Icon: Landmark, verdict: "info", q: "Could I afford a big one-off purchase today?", text: "There are no cash or investment assets marked available for drawdown, so there's nothing liquid to fund a one-off purchase from today.", note: "A one-off here is funded only from cash and investments you've marked available for drawdown — not pensions or property." });
              else if (oo.safe <= 0)
                cards.push({ Icon: Landmark, verdict: "info", q: "Could I afford a big one-off purchase today?", text: <>There's no <b>safe</b> room for a one-off right now — spending any of your cash or investments today would put the plan at risk if returns disappoint or you live longer than expected. {maxCapped ? <>You could free up your entire accessible cash and investments — about <b>{m(oo.max)}</b> — and the plan would still fund for life on current assumptions, but it leaves no liquid buffer and no margin for poor markets or a longer life.</> : <>The most you could spend before the plan would run short on current assumptions is about <b>{m(oo.max)}</b>, but that leaves no margin at all.</>}</>, note: "Funded only from cash and investments marked available for drawdown — pensions and property are excluded. \u201CSafe\u201D means the plan still funds for life even with returns 2 points lower across all assets and both of you living to 100. Today's money; ignores any tax on a sale." });
              else
                cards.push({ Icon: Landmark, verdict: "head", q: "Could I afford a big one-off purchase today?", text: <>About <b>{m(oo.safe)}</b> today, taken from your cash and investments and leaving pensions and property untouched — with the plan still funded for life <i>even if</i> returns run 2 points lower and you both live to 100. That would leave roughly {m(oo.leftover)} in accessible savings and a projected estate of about {m(oo.estateAfter)} at the end of the plan. {maxCapped ? <>Beyond that you could draw on the rest of your accessible cash and investments — up to about {m(oo.max)} in total — with the plan still funded on current assumptions, though that leaves no liquid buffer for poor markets or a longer life.</> : <>Stretching further, the most you could spend before the plan would run short on current assumptions is {m(oo.max)} — but that keeps no margin for poor markets or a longer life.</>}</>, note: "Funded only from cash and investments you've marked available for drawdown — pensions and property are deliberately excluded, as spending those involves tax, access and your legacy. Figures are in today's money and ignore any tax or penalty on a sale." });
            }

            // MONTHLY
            if (goal.maxMonthly != null) {
              const safeMo = goal.maxMonthlySafe;
              if (safeMo != null && safeMo >= 50)
                cards.push({ Icon: Receipt, verdict: "head", q: "Could I take on a new monthly cost?", text: safeMo >= 50000 ? `A substantial new monthly commitment would still leave the plan funded for life ${cushionPhrase}.` : `Up to about ${m(safeMo)} a month extra, with the plan still funded for life ${cushionPhrase}.`, note: `Models a permanent new expense starting today and rising with inflation — it doesn't account for the cost stopping later (e.g. school fees ending). ${cushionNote} The absolute ceiling, with no cushion, is about ${m(goal.maxMonthly)} a month.` });
              else
                cards.push({ Icon: Receipt, verdict: "info", q: "Could I take on a new monthly cost?", text: `There's little safe room for a new ongoing cost right now — the plan funds at break-even, but a permanent new commitment would use up its cushion against poor markets.`, note: `Models a permanent new expense rising with inflation. ${cushionNote} The plan could absorb up to about ${m(goal.maxMonthly)} a month before it would run short on current assumptions, but with no margin.` });
            }

            if (goal.stopSaving) {
              const ss = goal.stopSaving;
              const ssNote = `\u201CSaving\u201D here means the regular contributions you pay into your pensions and investments — about ${m(ss.total)} a year in total. The card switches them all off from today; your spending, retirement age and income are left exactly as planned. Any spare income in a year still follows your surplus setting in Assumptions.`;
              if (ss.safe)
                cards.push({ Icon: PiggyBank, verdict: "head", q: "Could I stop saving now?", text: `Yes — you could stop the regular contributions you're paying in (about ${m(ss.total)} a year) and the plan would still be funded for life with room to spare, ${cushionPhrase}.`, note: ssNote });
              else if (ss.funded)
                cards.push({ Icon: PiggyBank, verdict: "info", q: "Could I stop saving now?", text: `You could stop the regular contributions you're paying in (about ${m(ss.total)} a year) and the plan would still fund for life — but with little safety margin; a 1-point shortfall in returns would put it under pressure. Carrying on a while longer keeps that cushion.`, note: ssNote });
              else
                cards.push({ Icon: PiggyBank, verdict: "info", q: "Could I stop saving now?", text: `Not yet — the contributions you're paying in (about ${m(ss.total)} a year) are still doing real work. The plan funds for life with them running as planned, but stopping them today would leave it short.`, note: ssNote });
            }

          } else {
            // NOT FUNDED — what would fix it
            if (goal.spend != null) {
              const cutEdge = (1 - goal.spend) * 100;
              if (goal.spendSafe != null && goal.maxSpendSafe != null && goal.spendSafe < 1)
                cards.push({ Icon: Receipt, verdict: "need", q: "How much would I need to cut spending?", text: `Spending needs to drop by about ${cutEdge.toFixed(0)}%${goal.maxSpend != null ? ` (to about ${m(goal.maxSpend)} a year)` : ""} to fund the plan — or about ${((1 - goal.spendSafe) * 100).toFixed(0)}% (to about ${m(goal.maxSpendSafe)}) to fund it with a safety cushion ${cushionPhrase}.`, note: `All other inputs held constant; the cut is applied uniformly across recurring spending. ${cushionNote}` });
              else
                cards.push({ Icon: Receipt, verdict: "need", q: "How much would I need to cut spending?", text: `Spending needs to drop by about ${cutEdge.toFixed(0)}%${goal.maxSpend != null ? ` (to about ${m(goal.maxSpend)} a year)` : ""} to fully fund the plan.`, note: "All other inputs held constant; the cut is applied uniformly across recurring spending. A cushion against poor markets would need a deeper cut than the asset base comfortably allows." });
            }
            else
              cards.push({ Icon: Receipt, verdict: "no", q: "How much would I need to cut spending?", text: "The plan can't be funded even on a much-reduced budget — the income and asset base is the constraint.", note: "This points to an income or asset shortfall, not a spending problem." });

            if (goal.retire != null) {
              const wlBasis = `${smile ? "Spending follows your retirement-smile pattern (lifestyle eases in later life), which the solver applies." : "Assumes spending unchanged through retirement."} Working longer adds income and delays drawdown. If only one partner works, the gain is proportionally smaller. The solver works in whole years.`;
              if (goal.retireSafe != null && goal.retireSafe > goal.retire)
                cards.push({ Icon: User, verdict: "need", q: "How much longer would I need to work?", text: `About ${goal.retire} more year${goal.retire === 1 ? "" : "s"}${couple ? " each" : ` (retire at ${ret1 + goal.retire})`} funds the plan — or about ${goal.retireSafe} more year${goal.retireSafe === 1 ? "" : "s"} to fund it with a safety cushion ${cushionPhrase}.`, note: `${wlBasis} ${cushionNote}` });
              else
                cards.push({ Icon: User, verdict: "need", q: "How much longer would I need to work?", text: `About ${goal.retire} more year${goal.retire === 1 ? "" : "s"}${couple ? " each" : ` (retire at ${ret1 + goal.retire})`} fully funds the plan.`, note: wlBasis });
            }
            else
              cards.push({ Icon: User, verdict: "no", q: "Would working longer fix it?", text: "Working longer alone doesn't close the gap within 25 years — it needs combining with lower spending or higher returns.", note: "The structural gap is too large for additional working years alone to resolve." });

            if (goal.growth != null)
              cards.push({ Icon: TrendingUp, verdict: "need", q: "What return would make this work?", text: `Returns need to be about ${goal.growth.toFixed(1)} percentage points higher across all assets to fully fund the plan (e.g. 5% becomes ~${(5 + goal.growth).toFixed(1)}%).`, note: "Applies a uniform uplift to all assets simultaneously. Chasing higher returns means accepting higher risk — discuss suitability before adjusting growth assumptions." });
            else
              cards.push({ Icon: TrendingUp, verdict: "no", q: "What return would make this work?", text: "Even a very high return can't fully fund this plan — the gap is structural.", note: "The deficit is too large to be closed by returns alone. Look at contributions, spending, or the retirement date." });
          }

          // ALWAYS SHOWN
          {
            const ec = computeEstate(goal.estateEnd, est, couple);
            if (ec.applied) {
              cards.push({ Icon: Landmark, verdict: "info", q: "What will I leave behind?", text: <>The projected estate at the end of the plan ({goal.estateEndYear}) is about <b>{m(ec.gross)}</b>{hasProperty ? ", including any property still held" : ""}. After a tax-free allowance of {m(ec.allowance)}{couple && est.transferableNrb !== false ? " (both partners' allowances combined)" : ""}, estimated succession tax is about <b>{m(ec.tax)}</b>, leaving roughly <b>{m(ec.net)}</b> to beneficiaries.</>, note: "In today's money, before any funeral or administration costs. A simplified flat-allowance, single-rate illustration set in Tax & Jurisdiction — it applies the residence-band taper on large estates but ignores lifetime gifts, trusts and reliefs. Not estate-planning advice." });
            } else {
              cards.push({ Icon: Landmark, verdict: "info", q: "How much could I leave behind?", text: `The plan is projected to leave about ${m(goal.estateEnd)} at the end of the plan (${goal.estateEndYear})${hasProperty ? ", including any property still held" : ""}.`, note: "In today's money (real terms). Before any inheritance or succession tax — switch on Estate & succession tax in Tax & Jurisdiction to estimate that. Based on current assumptions with no changes." });
            }
          }
          cards.push({ Icon: Shield, verdict: goal.to100 ? "head" : "need", q: "What if I live to 100?", text: goal.to100 ? "The plan still holds even if life runs to age 100." : "The plan would run short before age 100 — longevity is a real risk worth planning for.", note: "All inputs unchanged. Spending and growth rates are held constant to age 100, which may overstate costs (older retirees often spend less) or understate them (long-term care). Consider this a conservative longevity stress test." });

          // CONCENTRATION — how much of today's assets sits in one holding or one class. Observational.
          {
            const gross = assets.reduce((s, a) => s + (Number(a.value) || 0), 0);
            if (gross > 0 && assets.length > 0) {
              let top = assets[0]; assets.forEach((a) => { if ((Number(a.value) || 0) > (Number(top.value) || 0)) top = a; });
              const byType = {}; assets.forEach((a) => { byType[a.type] = (byType[a.type] || 0) + (Number(a.value) || 0); });
              let topType = Object.keys(byType)[0]; Object.keys(byType).forEach((tp) => { if (byType[tp] > byType[topType]) topType = tp; });
              const assetPct = Math.round(((Number(top.value) || 0) / gross) * 100);
              const typePct = Math.round((byType[topType] / gross) * 100);
              const concentrated = assetPct >= 50 || typePct >= 70;
              const single = assets.length === 1;
              cards.push({ Icon: Layers, verdict: concentrated ? "info" : "head", q: "How spread out are the assets?",
                text: single
                  ? <>Everything sits in a single holding — <b>{top.name || TYPE_LABEL[top.type]}</b>. The whole plan rides on how that one asset performs.</>
                  : <>The largest single holding, <b>{top.name || TYPE_LABEL[top.type]}</b>, is about <b>{assetPct}%</b> of total assets, and <b>{typePct}%</b> sits in {(TYPE_LABEL[topType] || topType).toLowerCase()}. {concentrated ? "That's a notable concentration — the plan leans heavily on how that part performs." : "That's a reasonably balanced spread across holdings."}</>,
                note: "How much of total assets sits in one holding or one asset class. An observation about diversification — not a recommendation. Uses today's gross asset values, before debts." });
            }
          }

          // PROPERTY AS A BACKSTOP — only when property is held and currently treated as non-spendable.
          if (goal.propRelease) {
            const pr = goal.propRelease;
            if (!goal.fundedNow && pr.nowFunded)
              cards.push({ Icon: Home, verdict: "head", q: "What if I released my property?", text: <>Releasing your property (about <b>{m(pr.propVal)}</b>) into investments would take the plan from running short to <b>fully funded for life</b>. In effect, your home is the plan's backstop — the shortfall is a liquidity problem, not a wealth problem.</>, note: "Treats the property as sold at today's value and reinvested, ignoring sale costs, capital gains tax and the fact you need somewhere to live. A what-if to show the home's role — not a recommendation to sell." });
            else if (!goal.fundedNow && !pr.nowFunded)
              cards.push({ Icon: Home, verdict: "need", q: "What if I released my property?", text: <>Even releasing your property (about {m(pr.propVal)}) into investments wouldn't fully fund the plan on current assumptions{pr.depAge ? ` — it would extend to around age ${pr.depAge}` : ""}. The gap is larger than the home can cover, so it needs combining with other changes.</>, note: "Treats the property as sold at today's value and reinvested, before sale costs, capital gains tax or rehousing. Shows the home's role as a partial backstop only." });
            else
              cards.push({ Icon: Home, verdict: "info", q: "What if I released my property?", text: <>The plan already funds for life without touching your property (about {m(pr.propVal)}) — it sits as spare capacity and legacy. Released into investments, the projected estate would be about {m(pr.estate)}.</>, note: "Treats the property as sold at today's value and reinvested at your investment growth rate — so the proceeds would carry investment risk, not just higher returns. Ignores sale costs, tax and rehousing. Most clients keep the home; this simply shows what it represents within the plan." });
          }
          return (
            <div className="modal-scrim" onClick={() => setGoalOpen(false)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-head">
                  <div><div className="modal-title">What if I asked… <span style={{fontSize:"0.68rem",textTransform:"uppercase",letterSpacing:"0.05em",color:"var(--mid)",opacity:0.7,fontWeight:600,marginLeft:6}}>Full lifetime simulation</span></div><div className="modal-sub">{goal.fundedNow ? "This plan is fully funded. Here's what the client can ask — and the answer the numbers give." : "This plan runs short. Here's what the client tends to ask — and what would close the gap."}</div></div>
                  <button className="icon-btn" onClick={() => setGoalOpen(false)}><XCircle size={18} /></button>
                </div>
                <div className="goal-cards">
                  {cards.map((c, i) => (
                    <div key={i} className={`goal-card goal-${c.verdict}`}>
                      <div className="goal-card-head"><c.Icon size={15} /> {c.q}</div>
                      <div className="goal-card-text">{c.text}</div>
                      {c.note && <div className="goal-card-note">{c.note}</div>}
                    </div>
                  ))}
                </div>
                <div className="modal-foot">Each answer moves one lever at a time — everything else is held constant. Read the small-print on each card before quoting the number to a client.</div>
              </div>
            </div>
          );
        })()}
        {stressOpen && (
          <div className="modal-scrim" onClick={() => setStressOpen(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <div><div className="modal-title">Stress test</div><div className="modal-sub">See how the plan holds up against a shock. The stressed path overlays in red on the chart.</div></div>
                <button className="icon-btn" onClick={() => setStressOpen(false)}><XCircle size={18} /></button>
              </div>
              {(stress || ci) && stressImpact && (
                <div className="active-overlay">
                  <span><AlertTriangle size={13} /> Active: {stressImpact.label}</span>
                  <button onClick={clearScenario}>Clear overlay</button>
                </div>
              )}
              {[
                { key: "historical", title: "Historical episodes", note: "Illustrative sequences shaped on real market crises and their recoveries." },
                { key: "stylised", title: "Stylised assumptions", note: "Simple, fully explainable shocks applied to your growth assumption." },
                { key: "custom", title: "Build your own", note: "Type a run of annual returns from the start year." },
              ].map((grp) => (
                <div className="stress-group" key={grp.key}>
                  <div className="stress-group-head">{grp.title}<span>{grp.note}</span></div>
                  <div className="goal-cards">
                    {STRESS_SCENARIOS.filter((s) => s.group === grp.key).map((s) => (
                      <button key={s.id} className={`stress-card ${stress === s.id ? "on" : ""}`} onClick={() => { if (stress === s.id) { setStress(null); } else { applyStress(s.id); } }}>
                        <div className="goal-card-head"><AlertTriangle size={14} /> {s.label}</div>
                        <div className="goal-card-text">{s.short}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Live configuration for the selected scenario */}
              {stress && (() => {
                const sc = stressById(stress);
                if (!sc) return null;
                const cust = stressCfg.custom || [];
                return (
                  <div className="stress-cfg">
                    <div className="stress-cfg-row">
                      {sc.timingable && (
                        <div className="rec-field"><label>When it hits <InfoTip text="“At retirement” lands the shock just as drawdown begins — the most damaging timing, because losses are locked in by withdrawals (sequence-of-returns risk)." /></label>
                          <Seg value={stressCfg.timing} onChange={(v) => upStressCfg({ timing: v })} options={[{ value: "now", label: "Starting now" }, { value: "retirement", label: "At retirement" }]} /></div>
                      )}
                      {sc.lensable && (
                        <div className="rec-field"><label>Market lens <InfoTip text="A sterling investor and a globally-diversified investor lived very different versions of the same crisis. Global uses broad world equity in the client's currency; UK uses broad UK equity." /></label>
                          <Seg value={stressCfg.lens} onChange={(v) => upStressCfg({ lens: v })} options={[{ value: "global", label: "Global" }, { value: "uk", label: "UK" }]} /></div>
                      )}
                      <div className="rec-field"><label>Applies to <InfoTip text={sc.mode === "absolute" ? "Historical return sequences apply to investments and pensions only. Cash and property continue at their own assumed rates." : "Most crashes hit equities and pension funds hardest while cash and property hold up. \"All assets\" applies the same shift to everything, including property and cash."} /></label>
                        {sc.mode === "absolute"
                          ? <div className="stress-fixed-label">Equities &amp; pensions only</div>
                          : <Seg value={stressCfg.affects} onChange={(v) => upStressCfg({ affects: v })} options={[{ value: "growth", label: "Equities & pensions" }, { value: "all", label: "All assets" }]} />}
                      </div>
                    </div>
                    {sc.id === "custom" && (
                      <div className="stress-custom">
                        <div className="stress-custom-lbl">Annual returns from the start year (%)</div>
                        <div className="stress-custom-rows">
                          {cust.map((v, i) => (
                            <div className="stress-custom-cell" key={i}>
                              <span className="stress-custom-yr">Yr {i + 1}</span>
                              <Mini value={v} suffix="%" step={1} onChange={(nv) => upStressCfg({ custom: cust.map((x, j) => (j === i ? nv : x)) })} />
                              <button className="stress-custom-x" onClick={() => upStressCfg({ custom: cust.filter((_, j) => j !== i) })}>×</button>
                            </div>
                          ))}
                          <button className="stress-custom-add" onClick={() => upStressCfg({ custom: [...cust, 0] })}><Plus size={13} /> year</button>
                        </div>
                      </div>
                    )}
                    {stressImpact && (
                      <div className="stress-verdict">
                        <div className="stress-verdict-row"><span>Base plan</span><b>{stressImpact.baseAge ? `Funds to age ${stressImpact.baseAge}` : "Funded for life"}</b></div>
                        <div className={`stress-verdict-row ${stressImpact.stressAge && stressImpact.stressAge !== stressImpact.baseAge ? "worse" : ""}`}><span>Under this scenario</span><b>{stressImpact.stressAge ? `Funds to age ${stressImpact.stressAge}` : "Still funded for life"}</b></div>
                      </div>
                    )}
                  </div>
                );
              })()}
              <div className={`ci-block ${ci ? "on" : ""}`}>
                <div className="ci-head"><Shield size={14} /> Critical illness claim</div>
                <div className="ci-text">Model a serious-illness diagnosis: a lump sum is paid and {couple ? "the affected person's" : "your"} salary-type income stops from that age. If already retired, only the lump sum applies. To show the impact of lost income with <b>no cover in place</b>, set the payout to {sym}0.</div>
                <div className="rec-grid">
                  {couple && <div className="rec-field"><label>Who</label><Pick value={ciDraft.owner} onChange={(v) => setCiDraft((d) => ({ ...d, owner: v }))} options={ownerOpts.filter((o) => o.value !== "joint")} /></div>}
                  <div className="rec-field"><label>Age at claim</label><Mini value={ciDraft.age} step={1} onChange={(v) => setCiDraft((d) => ({ ...d, age: v }))} /></div>
                  <div className="rec-field"><label>Lump-sum payout</label><Money value={ciDraft.amount} symbol={sym} onChange={(v) => setCiDraft((d) => ({ ...d, amount: v }))} /></div>
                </div>
                {(() => { const ciCover = protection.filter((p) => (p.ptype || "life") === "ci" && (p.insured || "client1") === ciDraft.owner && (Number(p.coverToAge) || 0) >= (Number(ciDraft.age) || 0)).reduce((s2, p) => s2 + (Number(p.sumAssured) || 0), 0); return ciCover > 0 && Number(ciDraft.amount) !== ciCover ? <div className="ci-hint">CI cover in force at that age: <b className="num">{fmtFull(ciCover, cur)}</b> <button className="xc-btn" onClick={() => setCiDraft((d) => ({ ...d, amount: ciCover }))}>Use</button></div> : null; })()}
                <div className="ci-actions">
                  <button className="ci-apply" onClick={() => { applyCi(ciDraft); setStressOpen(false); }}>{ci ? "Update claim overlay" : "Apply claim overlay"}</button>
                  {ci && <button className="ci-clear" onClick={() => setCi(null)}>Clear</button>}
                </div>
              </div>
              <div className="modal-foot">
                {(stress || ci)
                  ? <div className="stress-foot-actions"><button className="wi-reset" onClick={() => { clearScenario(); setStressOpen(false); }}>Clear stress test</button><button className="goal-btn" onClick={() => setStressOpen(false)}>↗ Show on chart</button></div>
                  : "The base plan is unchanged — this only overlays a comparison line so you can show the client the plan still holds (or where it doesn't)."}
              </div>
            </div>
          </div>
        )}
        {mcOpen && (() => {
          const ready = mcResult && mcResult.sig === mcSig;
          const prob = ready ? mcResult.prob : (mcResult ? mcResult.prob : null);
          const pill = prob == null ? "" : prob >= 85 ? "green" : prob >= 60 ? "amber" : "red";
          const retYear = baseYear + Math.max(0, ectx.retC1 - ectx.age0c1);
          const d0 = (v, y) => (showReal ? v / Math.pow(1 + inflDec, y) : v);
          const fanData = mcResult ? mcResult.fan.map((f) => ({ year: f.year, band80: [d0(f.p10, f.y), d0(f.p90, f.y)], band50: [d0(f.p25, f.y), d0(f.p75, f.y)], p50: d0(f.p50, f.y) })) : [];
          const endF = mcResult ? mcResult.fan[mcResult.fan.length - 1] : null;
          const basisTxt = showReal ? "today's money" : "future money";
          return (
            <div className="modal-scrim" onClick={() => setMcOpen(false)}>
              <div className="modal mc-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-head">
                  <div><div className="modal-title"><Activity size={16} /> Goal confidence</div><div className="modal-sub">The chance of meeting {couple ? `${fn1} & ${fn2}'s` : `${fn1}'s`} goals across {MC_RUNS} randomised market futures, varied around your assumed growth.</div></div>
                  <button className="icon-btn" onClick={() => setMcOpen(false)}><XCircle size={18} /></button>
                </div>

                {mcRun.running && (
                  <div className="mc-progress"><div className="mc-progress-bar" style={{ width: `${Math.round(mcRun.progress * 100)}%` }} /><span>Running simulations… {Math.round(mcRun.progress * 100)}%</span></div>
                )}

                {mcResult && (
                  <div className={`mc-body ${mcRun.running ? "dim" : ""}`}>
                    <div className="mc-headline">
                      <div className={`mc-prob mc-prob-${pill}`}>{Math.round(prob)}<span>%</span></div>
                      <div className="mc-headline-txt">
                        <div className="mc-headline-main">chance of the main goal — funding {couple ? "both" : fn1 + "'s"} lifestyle <b>for life</b> without running out</div>
                        <div className="mc-headline-sub">The single-line plan assumes returns arrive smoothly. This varies them year to year — capturing the risk of a bad run, especially around retirement.</div>
                      </div>
                    </div>

                    {endF && (
                      <div className="mc-goals">
                        <div className="mc-goal"><span className="mc-goal-q">Income goal — never run out</span><b className={`mc-goal-a mc-goal-${pill}`}>{Math.round(prob)}% of futures</b></div>
                        <div className="mc-goal"><span className="mc-goal-q">Spendable assets left — typical future <InfoTip text="The median across all simulated futures of spendable assets at the end of the plan. Excludes property and is before any estate tax, so it differs from the 'What will I leave behind?' estate figure, which includes property and applies succession tax." /></span><b className="mc-goal-a">{fmtFull(d0(endF.p50, endF.y), cur)}</b></div>
                        <div className="mc-goal"><span className="mc-goal-q">Spendable assets left — poor run (worst 1 in 10)</span><b className="mc-goal-a">{fmtFull(d0(endF.p10, endF.y), cur)}</b></div>
                      </div>
                    )}

                    <div className="mc-controls">
                      <div className="rec-field"><label>Market volatility <InfoTip text="How widely returns swing around your assumed growth. Derived from each asset's expected return — higher-returning assets are assumed more volatile. Cash barely moves; equities and pensions move most. Lower / Typical / Higher scales the whole range." /></label>
                        <Seg value={mcLevel} onChange={setMcLevel} options={MC_LEVELS.map((l) => ({ value: l.id, label: l.label }))} /></div>
                    </div>

                    <div className="mc-chart">
                      <div className="mc-chart-title">Spendable assets — range of outcomes <span>({basisTxt}, excludes property)</span></div>
                      <ResponsiveContainer width="100%" height={250}>
                        <ComposedChart data={fanData} margin={{ top: 8, right: 14, left: 6, bottom: 2 }}>
                          <CartesianGrid stroke={t.grid} vertical={false} />
                          <XAxis dataKey="year" tick={{ fill: t.mid, fontSize: 11 }} axisLine={{ stroke: t.grid }} tickLine={false} interval={Math.max(0, Math.floor(fanData.length / 9))} />
                          <YAxis tickFormatter={(v) => fmtCompact(v, cur)} tick={{ fill: t.mid, fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
                          <Area type="monotone" dataKey="band80" stroke="none" fill={t.netStroke} fillOpacity={0.14} isAnimationActive={false} />
                          <Area type="monotone" dataKey="band50" stroke="none" fill={t.netStroke} fillOpacity={0.26} isAnimationActive={false} />
                          <Line type="monotone" dataKey="p50" stroke={t.netStroke} strokeWidth={2.4} dot={false} isAnimationActive={false} />
                          {retYear > baseYear && <ReferenceLine x={retYear} stroke={t.mid} strokeDasharray="3 3" label={{ value: "Retirement", position: "top", fill: t.mid, fontSize: 10 }} />}
                        </ComposedChart>
                      </ResponsiveContainer>
                      <div className="mc-fan-key"><span><i style={{ background: t.netStroke, opacity: 0.26 }} /> Middle 50% of outcomes</span><span><i style={{ background: t.netStroke, opacity: 0.14 }} /> Middle 80%</span><span><i className="mc-key-line" style={{ background: t.netStroke }} /> Median path</span></div>
                    </div>

                    {endF && (
                      <div className="mc-stats">
                        <div className="mc-stat"><div className="mc-stat-lbl">Downside ({mcResult.fan[mcResult.fan.length - 1].year})</div><div className="mc-stat-val">{fmtCompact(d0(endF.p10, endF.y), cur)}</div><div className="mc-stat-sub">1-in-10 worse than this</div></div>
                        <div className="mc-stat mc-stat-mid"><div className="mc-stat-lbl">Median</div><div className="mc-stat-val">{fmtCompact(d0(endF.p50, endF.y), cur)}</div><div className="mc-stat-sub">the typical outcome</div></div>
                        <div className="mc-stat"><div className="mc-stat-lbl">Upside</div><div className="mc-stat-val">{fmtCompact(d0(endF.p90, endF.y), cur)}</div><div className="mc-stat-sub">1-in-10 better than this</div></div>
                      </div>
                    )}

                    <p className="mc-note">Spendable assets exclude property and are shown in {basisTxt}. Returns are modelled as normal variation around your assumptions with a shared market factor, so growth assets move together in good and bad years. Real markets have occasional shocks larger than this model assumes, so treat the figure as an indicator of resilience, not a precise probability. Illustration only — not a prediction or a recommendation.</p>
                  </div>
                )}

                {!mcResult && !mcRun.running && <div className="mc-empty">Preparing simulation…</div>}
              </div>
            </div>
          );
        })()}
        {reportOpen && (() => {
          const reportDate = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
          const anon = reportCfg.anonymous;
          const dn1 = anon ? "Client 1" : (c1.name || "Client 1");
          const dn2 = anon ? "Client 2" : (c2.name || "Client 2");
          const dfn1 = anon ? "Client 1" : fn1, dfn2 = anon ? "Client 2" : fn2;
          const clientName = couple ? `${dn1} & ${dn2}` : dn1;
          const retRow = data.find((r) => r.c1Age === ectx.retC1);
          const basis = showReal ? "Today's money (real terms)" : "Future money (nominal terms)";
          const ownerLabel = (o) => (o === "joint" ? "Joint" : o === "client2" ? dfn2 : dfn1);
          const insuredLabel = (o) => (o === "client2" ? dfn2 : dfn1);
          const anchorTxt = (a, owner = "client1") => {
            if (!a) return "—";
            const o = owner === "joint" ? "client1" : owner;
            const yr = baseYear + (resolveAge(a, o, ectx) - (o === "client2" ? ectx.age0c2 : ectx.age0c1));
            if (a.mode === "now") return "Start";
            if (a.mode === "retirement") return `Retirement (${yr})`;
            if (a.mode === "end") return `End of plan (${yr})`;
            if (a.mode === "age") return `Age ${a.age} (${yr})`;
            return "—";
          };
          const escTxt = (it) => (it.escalation === "inflation" ? `Inflation (${assumptions.inflation}%)` : it.escalation === "custom" ? `${it.customEsc || 0}%` : "None");
          const freqTxt = (it) => (it.frequency === "monthly" ? "Monthly" : it.frequency === "oneoff" ? "One-off" : it.frequency === "everyN" ? `Every ${it.everyYears || 1} yrs` : "Annual");
          const m = (v) => fmtFull(v, cur);
          const S = reportCfg.sections;
          const SECTION_DEFS = [
            { id: "exec", label: "Executive summary" },
            { id: "snapshot", label: "Financial snapshot" },
            { id: "yeartable", label: "Year-by-year summary" },
            { id: "charts", label: "Projection charts" },
            { id: "cashgap", label: "Cash gap analysis" },
            { id: "stress", label: "Stress test result", off: !stressActive, why: "no stress test active" },
            { id: "mcconf", label: "Plan confidence (Monte Carlo)", off: false },
            { id: "protection", label: "Protection & gap analysis", off: protection.length === 0 && !(protGap && protGap.bench.some((b) => b.inc > 0)), why: "no policies or income entered" },
            { id: "whatif", label: "\u201CWhat if I asked\u2026\u201D answers", off: !goal, why: "" },
            { id: "inputs", label: "Detailed inputs", },
            { id: "assumptions", label: "Assumptions" },
            { id: "taxov", label: "Tax overview", off: !((assumptions.tax && assumptions.tax.enabled) || (assumptions.tax && assumptions.tax.estate && assumptions.tax.estate.enabled)), why: "no tax applied to this plan" },
            { id: "commentary", label: "Commentary" },
          ];
          const on = (id) => { const d = SECTION_DEFS.find((x) => x.id === id); return S[id] && d && !d.off; };
          const setPreset = (kind) => {
            const brief = { exec: true, snapshot: false, yeartable: true, charts: true, cashgap: false, stress: false, mcconf: false, protection: false, whatif: false, inputs: false, assumptions: true, taxov: false, commentary: false };
            const comp = { exec: true, snapshot: true, yeartable: true, charts: true, cashgap: true, stress: true, mcconf: true, protection: true, whatif: true, inputs: true, assumptions: true, taxov: true, commentary: true };
            upReportCfg({ sections: kind === "brief" ? brief : comp });
          };
          const verdictText = kpis.depletionAge === null
            ? `Based on the assumptions set out in this report, the plan remains fully funded throughout, with approximately ${m(kpis.endVal)} of net worth remaining at the end of the plan in ${kpis.endYear}.`
            : `Based on the assumptions set out in this report, spendable assets are projected to run short around ${kpis.depYear}${kpis.depName ? ` (${anon ? (kpis.depName === fn1 ? "Client 1" : "Client 2") : kpis.depName} aged ${kpis.depletionAge})` : ` (age ${kpis.depletionAge})`}. The size of the gap is sensitive to contributions, retirement age and planned spending.`;
          const longevity = kpis.depletionAge === null ? "Funded for life" : `Funds to age ${kpis.depletionAge}`;
          const scenarioSuffix = survivorOverlay
            ? ` — ${survivorOverlay.owner === "client2" ? dfn2 : dfn1} dies age ${survivorOverlay.deathAge}${survivorOverlay.essentialOnly ? " · essentials only" : ""}`
            : ci
              ? ` — CI · ${ci.owner === "client2" ? dfn2 : dfn1} age ${ci.age}`
              : stressImpact && stressActive
                ? ` — ${stressImpact.label}`
                : "";
          const RepFoot = () => <div className="rep-foot">Illustration only — not financial advice · {clientName}{scenarioSuffix} · {reportDate}{reportCfg.firm ? ` · ${reportCfg.firm}` : ""}</div>;
          const RepHead = () => <div className="rep-runhead" aria-hidden="true"><span className="rep-rh-brand"><svg viewBox="0 0 48 54" width="14" height="16" fill="none"><path d="M5 48 L5 12 L24 35 L43 12 L43 48" stroke="#0CA5A5" strokeWidth="7" strokeLinecap="butt" strokeLinejoin="miter" /><circle cx="24" cy="6" r="3.6" fill="#C8A951" /></svg>Meridian</span><span className="rep-rh-doc">{clientName} · Cashflow plan</span></div>;
          const assetMix = (() => { const by = {}; assets.forEach((a) => { by[a.type] = (by[a.type] || 0) + (Number(a.value) || 0); }); return Object.entries(by).filter(([, v]) => v > 0).map(([type, value]) => ({ type, value, name: TYPE_LABEL[type] })); })();
          const y0 = rows[0] || {}; const inc0 = y0.income || 0; const exp0 = y0.expenditure || 0;

          /* ---------- Stage 1: options modal ---------- */
          if (reportStage === "options") return (
            <div className="modal-scrim" onClick={() => setReportOpen(false)}>
              <div className="modal report-modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="modal-title">Generate report</h3>
                <div className="rcfg-presets">
                  <button className="xc-btn" onClick={() => setPreset("brief")}>Brief</button>
                  <button className="xc-btn" onClick={() => setPreset("comprehensive")}>Comprehensive</button>
                  <span className="rcfg-presets-note">presets — fine-tune below</span>
                </div>
                <div className="rcfg-grid">
                  {SECTION_DEFS.map((d) => {
                    if (d.id === "mcconf") {
                      const fresh = mcResult && mcResult.sig === mcSig;
                      const running = mcRun.running;
                      return (
                        <div key="mcconf" className="rcfg-row rcfg-mc-row">
                          <input type="checkbox" checked={!!S.mcconf} onChange={(e) => upReportCfg({ sections: { mcconf: e.target.checked } })} />
                          <span className="rcfg-mc-body">
                            <span className="rcfg-mc-label">Plan confidence (Monte Carlo)</span>
                            {S.mcconf && (
                              <span className="rcfg-mc-controls">
                                {running
                                  ? <span className="rcfg-mc-status running">Running… {Math.round(mcRun.progress * 100)}%</span>
                                  : fresh
                                    ? <span className="rcfg-mc-status ok">Ready · {Math.round(mcResult.prob)}% funded · {(MC_LEVELS.find(l => l.id === mcResult.level) || MC_LEVELS[1]).label} volatility</span>
                                    : <span className="rcfg-mc-status pending">Will run when you generate</span>}
                                <span className="rcfg-mc-level-wrap">
                                  <label className="rcfg-mc-lbl">Volatility:</label>
                                  <Seg value={mcLevel} onChange={(v) => setMcLevel(v)} options={MC_LEVELS.map(l => ({ value: l.id, label: l.label }))} />
                                </span>
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    }
                    return (
                      <label key={d.id} className={`rcfg-row ${d.off ? "off" : ""}`}>
                        <input type="checkbox" disabled={!!d.off} checked={!!S[d.id] && !d.off} onChange={(e) => upReportCfg({ sections: { [d.id]: e.target.checked } })} />
                        <span>{d.label}{d.off && d.why ? <em> — {d.why}</em> : null}</span>
                      </label>
                    );
                  })}
                  <label className="rcfg-row locked"><input type="checkbox" checked disabled /><span>Cover page &amp; disclaimers <em>— always included</em></span></label>
                </div>
                <div className="rcfg-line">
                  <label className="rcfg-row"><input type="checkbox" checked={anon} onChange={(e) => upReportCfg({ anonymous: e.target.checked })} /><span>Hide client names <em>— shows "Client 1 / Client 2" and ages instead of names and dates of birth</em></span></label>
                </div>
                <div className="rcfg-id">
                  <div className="rec-field"><label>Prepared by</label><Text value={reportCfg.adviser} placeholder="Adviser name" onChange={(v) => upReportCfg({ adviser: v })} /></div>
                  <div className="rec-field"><label>Firm</label><Text value={reportCfg.firm} placeholder="Firm name (optional)" onChange={(v) => upReportCfg({ firm: v })} /></div>
                </div>
                {on("commentary") && (
                  <div className="rcfg-comm">
                    <div className="rcfg-comm-head"><label className="flbl">Commentary <InfoTip text="Generated by the planning engine from this plan's numbers — deterministic, observational language only, never advice. Edit freely or replace it with your own; Reset returns to the generated text." /></label>{commentaryEdit !== null && <button className="xc-btn" onClick={() => setCommentaryEdit(null)}>Reset to generated</button>}</div>
                    <textarea className="notes-area rcfg-comm-area" value={commentaryText} onChange={(e) => setCommentaryEdit(e.target.value)} />
                  </div>
                )}
                <div className="modal-actions">
                  <button className="wi-reset" onClick={() => setReportOpen(false)}>Cancel</button>
                  <button className="goal-btn" onClick={() => setReportStage("view")}>Generate report</button>
                </div>
              </div>
            </div>
          );

          /* ---------- Stage 2: report view ---------- */
          return (
            <div className="report-overlay">
              <div className="report-toolbar report-no-print">
                <span className="report-tb-title"><FileText size={15} /> Plan report — {clientName}</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="wi-reset" onClick={() => setReportStage("options")}>Options</button>
                  <button className="wi-reset" onClick={() => {
                    const sumLines = [
                      `Cashflow plan — ${clientName} (${reportDate})`,
                      verdictText,
                      `Net worth today: ${m(kpis.currentTotal)} · At retirement: ${m(kpis.atRetirement)} · End of plan (${kpis.endYear}): ${m(kpis.endVal)} · ${longevity}`,
                      cashGap && !cashGap.none && !cashGap.oneOffOnly ? `Sustained draw on savings begins ${reportCashGap.firstYear} (~${m(reportCashGap.avgDraw)}/yr).` : cashGap && cashGap.oneOffOnly ? `Savings used for one-off costs only (${reportCashGap.isolatedYears.join(", ")}).` : `Income covers spending throughout — savings never drawn upon.`,
                      `Figures in ${basis.toLowerCase()}. Illustration only — not financial advice.`,
                    ].filter(Boolean).join("\n\n");
                    navigator.clipboard && navigator.clipboard.writeText(sumLines).then(() => { setCopiedSummary(true); setTimeout(() => setCopiedSummary(false), 1800); });
                  }}>{copiedSummary ? "Copied ✓" : "Copy summary"}</button>
                  <button className="goal-btn" onClick={() => window.print()}>Print / Save as PDF</button>
                  <button className="wi-reset" onClick={() => setReportOpen(false)}>Close</button>
                </div>
              </div>
              <div className="report-sheet">

                {/* Cover + verdict */}
                <section className="report-page">
                  <div className="rep-cover">
                    <div className="rep-cover-brand"><svg viewBox="0 0 48 54" width="26" height="29" fill="none" aria-hidden="true"><path d="M5 48 L5 12 L24 35 L43 12 L43 48" stroke="#0CA5A5" strokeWidth="6" strokeLinecap="butt" strokeLinejoin="miter" /><circle cx="24" cy="6" r="3.2" fill="#C8A951" /></svg><span className="rep-cover-word">Meridian</span><span className="rep-cover-kicker">Cashflow plan</span></div>
                    <h1 className="rep-h1">{clientName}</h1>
                    <div className="rep-meta">Prepared {reportDate}{reportCfg.adviser ? ` by ${reportCfg.adviser}` : ""}{reportCfg.firm ? `, ${reportCfg.firm}` : ""} · Figures in {basis} · Currency {cur}</div>
                  </div>
                  <div className={`rep-verdict rep-${banner.tone}`}>
                    <div className="rep-verdict-tag">{kpis.depletionAge === null ? "Fully funded" : kpis.tone === "red" ? "At risk" : "Caution"}</div>
                    <div className="rep-verdict-text">{verdictText}</div>
                  </div>
                  <div className="rep-kpis">
                    <div className="rep-kpi"><span>Net worth today</span><b className="num">{m(kpis.currentTotal)}</b></div>
                    <div className="rep-kpi"><span>At retirement</span><b className="num">{m(kpis.atRetirement)}</b></div>
                    <div className="rep-kpi"><span>End of plan ({kpis.endYear})</span><b className={`num ${kpis.endVal > 0 ? "rep-pos" : "rep-neg"}`}>{m(kpis.endVal)}</b></div>
                    <div className="rep-kpi"><span>Plan longevity</span><b className={`num ${kpis.depletionAge === null ? "rep-pos" : kpis.tone === "red" ? "rep-neg" : "rep-warn"}`}>{longevity}</b></div>
                  </div>
                  <div className="rep-people">
                    <div className="rep-person"><b>{dfn1}</b><span>{anon ? `Age ${ectx.age0c1}` : `Born ${c1.dob}`} · Retires {c1.retirementAge} · Plan to {c1.lifeExpectancy}</span></div>
                    {couple && <div className="rep-person"><b>{dfn2}</b><span>{anon ? `Age ${ectx.age0c2}` : `Born ${c2.dob}`} · Retires {c2.retirementAge} · Plan to {c2.lifeExpectancy}</span></div>}
                  </div>
                  <RepFoot />
                </section>

                {/* Executive summary */}
                {on("exec") && (
                  <section className="report-page">
                  <RepHead />
                    <h2 className="rep-h2">Executive summary</h2>
                    <p className="rep-p rep-lede">{verdictText}</p>
                    <div className="rep-exec-grid">
                      <div className="rep-exec-item"><span>Annual income today</span><b className="num">{m(inc0)}</b></div>
                      <div className="rep-exec-item"><span>Annual spending today</span><b className="num">{m(exp0)}</b></div>
                      <div className="rep-exec-item"><span>Current position</span><b className="num">{inc0 - exp0 >= 0 ? `${m(inc0 - exp0)} surplus` : `${m(exp0 - inc0)} drawn from savings`}</b></div>
                      {reportCashGap && !reportCashGap.none && !reportCashGap.oneOffOnly && <div className="rep-exec-item"><span>Sustained draw on savings begins</span><b className="num">{reportCashGap.firstYear}</b></div>}
                      {reportCashGap && reportCashGap.oneOffOnly && <div className="rep-exec-item"><span>Draw on savings</span><b className="num">One-off costs only ({reportCashGap.isolatedYears.length} year{reportCashGap.isolatedYears.length === 1 ? "" : "s"})</b></div>}
                      {reportCashGap && reportCashGap.none && <div className="rep-exec-item"><span>Draw on savings</span><b className="num">None — income covers spending throughout</b></div>}
                      <div className="rep-exec-item"><span>Projected estate ({kpis.endYear})</span><b className="num">{m(kpis.endVal)}</b></div>
                    </div>
                    <p className="rep-p">This summary describes the projection under the stated assumptions. It is not a recommendation; figures will differ if actual returns, inflation, income or spending differ from those assumptions.</p>
                    {stressActive && <p className="rep-p rep-small">A stress scenario is currently active. The figures on this page describe the base plan; the projection charts and the stress test page reflect the scenario.</p>}
                    <RepFoot />
                  </section>
                )}

                {/* Financial snapshot */}
                {on("snapshot") && (
                  <section className="report-page">
                  <RepHead />
                    <h2 className="rep-h2">Financial snapshot — today</h2>
                    <div className="rep-snap">
                      <div className="rep-snap-pie">
                        <PieChart width={300} height={220}>
                          <Pie data={assetMix} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={86} paddingAngle={2} isAnimationActive={false}>
                            {assetMix.map((e) => <Cell key={e.type} fill={typeSwatch(e.type)} />)}
                          </Pie>
                        </PieChart>
                        <div className="rep-legend">{assetMix.map((e) => <span key={e.type}><i style={{ background: typeSwatch(e.type) }} /> {e.name} · {m(e.value)}</span>)}</div>
                      </div>
                      <table className="rep-table rep-snap-table">
                        <tbody>
                          <tr><td>Gross assets</td><td className="r num">{m(assets.reduce((s, a) => s + (Number(a.value) || 0), 0))}</td></tr>
                          {hasDebt && <tr><td>Less: liabilities</td><td className="r num">−{m(liabilities.reduce((s, L) => s + (Number(L.balance) || 0), 0))}</td></tr>}
                          <tr><td><b>Net worth</b></td><td className="r num"><b>{m(kpis.currentTotal)}</b></td></tr>
                          <tr><td>Annual income</td><td className="r num">{m(inc0)}</td></tr>
                          <tr><td>Annual spending</td><td className="r num">{m(exp0)}</td></tr>
                          <tr><td>{inc0 - exp0 >= 0 ? "Annual surplus" : "Annual draw on savings"}</td><td className="r num">{m(Math.abs(inc0 - exp0))}</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <RepFoot />
                  </section>
                )}

                {/* Year-by-year summary */}
                {on("yeartable") && yearTable.length > 0 && (
                  <section className="report-page">
                  <RepHead />
                    <h2 className="rep-h2">Year-by-year summary</h2>
                    <p className="rep-p">The plan at key ages — retirement, and at five-year intervals. {basis} Income includes planned drawdown; surplus is income less spending in that year.</p>
                    <table className="rep-table rep-yt">
                      <thead>
                        <tr>
                          <th>Year</th><th>{couple ? "Ages" : "Age"}</th>
                          <th className="r">Net worth</th><th className="r">Spendable</th>
                          <th className="r">Income</th><th className="r">Spending</th><th className="r">Surplus / (deficit)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {yearTable.map((r) => (
                          <tr key={r.year} className={r.isDep ? "yt-dep" : r.isRet ? "yt-ret" : ""}>
                            <td>{r.year}{r.isRet ? " ◆" : ""}{r.isDep ? " ▲" : ""}</td>
                            <td>{couple ? `${r.aliveC1 ? r.c1Age : "—"} / ${r.aliveC2 ? r.c2Age : "—"}` : r.c1Age}</td>
                            <td className="r num">{m(r.netWorth)}</td>
                            <td className="r num">{m(r.investable)}</td>
                            <td className="r num">{m(r.income)}</td>
                            <td className="r num">{m(r.spend)}</td>
                            <td className="r num" style={{ color: r.shortfall > 0 ? "#c62828" : r.surplus >= 0 ? "#1b7a4b" : "#b26a00", fontWeight: 600 }}>{r.surplus < 0 ? `(${m(Math.abs(r.surplus))})` : m(r.surplus)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="rep-p rep-small">◆ retirement year · ▲ year spendable funds run short. "Spendable" excludes property. Surplus shown in green, deficit funded by drawdown in amber, an unmet shortfall in red. {stressActive ? "Reflects the base plan; the stress scenario is on its own page. " : ""}Figures are {basis.toLowerCase()}</p>
                    <RepFoot />
                  </section>
                )}

                {/* Charts */}
                {on("charts") && (<>
                <section className="report-page">
                  <RepHead />
                  <h2 className="rep-h2">Projected net worth</h2>
                  <p className="rep-p">How total assets, less any debts, are projected to evolve over the life of the plan. Figures in {basis.toLowerCase()}.{stressActive ? " A stress scenario is active — see the stress test page." : ""}</p>
                  <div className="rep-chart">
                    <ComposedChart width={700} height={330} data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                        <CartesianGrid stroke="#eceff3" vertical={false} />
                        <XAxis dataKey="year" tick={{ fill: "#6b7480", fontSize: 10 }} axisLine={{ stroke: "#dfe3e9" }} tickLine={false} interval={Math.max(0, Math.floor(data.length / 9))} />
                        <YAxis tickFormatter={(v) => fmtCompact(v, cur)} tick={{ fill: "#6b7480", fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
                        {stackOrder.map((a) => <Area key={a.id} type="monotone" dataKey={aKey(a.id)} stackId="nw" stroke={colors[a.id]} strokeWidth={0.8} fill={colors[a.id]} fillOpacity={0.9} isAnimationActive={false} />)}
                        {hasProperty && <Line type="monotone" dataKey="investable" stroke="#7a8493" strokeWidth={1.4} strokeDasharray="5 3" dot={false} isAnimationActive={false} />}
                        {hasDebt && <Line type="monotone" dataKey="netWorth" stroke="#161b22" strokeWidth={1.6} dot={false} isAnimationActive={false} />}
                        {/* Retirement markers: collapse to one line when both retire same year, suppress deceased */}
                        {markers.retC1 && markers.retC2 && markers.retC1 === markers.retC2
                          ? <ReferenceLine x={markers.retC1} stroke="#161b22" strokeDasharray="4 3" strokeOpacity={0.6} />
                          : (<>
                            {markers.retC1 && <ReferenceLine x={markers.retC1} stroke="#161b22" strokeDasharray="4 3" strokeOpacity={0.6} />}
                            {markers.retC2 && markers.retC2 !== markers.retC1 && <ReferenceLine x={markers.retC2} stroke="#161b22" strokeDasharray="4 3" strokeOpacity={0.6} />}
                          </>)
                        }
                      </ComposedChart>
                  </div>
                  <div className="rep-legend">
                    {legendTypes.map((ty) => <span key={ty}><i style={{ background: typeSwatch(ty) }} /> {TYPE_LABEL[ty]}</span>)}
                    {hasProperty && <span><i className="rep-dash" /> Spendable (excl. property)</span>}
                    {hasDebt && <span><i className="rep-solid" /> Net worth after debts</span>}
                  </div>
                  <RepFoot />
                </section>
                <section className="report-page">
                  <RepHead />
                  <h2 className="rep-h2">Money in versus money out</h2>
                  <p className="rep-p">Annual income by source against total spending (the line). Where spending exceeds income, the shortfall is drawn from savings.</p>
                  <div className="rep-chart">
                    <ComposedChart width={700} height={330} data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                        <CartesianGrid stroke="#eceff3" vertical={false} />
                        <XAxis dataKey="year" tick={{ fill: "#6b7480", fontSize: 10 }} axisLine={{ stroke: "#dfe3e9" }} tickLine={false} interval={Math.max(0, Math.floor(data.length / 9))} />
                        <YAxis tickFormatter={(v) => fmtCompact(v, cur)} tick={{ fill: "#6b7480", fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
                        {incomes.map((i) => <Bar key={i.id} dataKey={iKey(i.id)} stackId="mio" fill={incColors[i.id]} fillOpacity={0.9} isAnimationActive={false} />)}
                        <Bar dataKey="coveredBySavings" stackId="mio" fill="#e0a23a" fillOpacity={0.85} isAnimationActive={false} />
                        <Bar dataKey="uncovered" stackId="mio" fill="#d64545" fillOpacity={0.9} isAnimationActive={false} />
                        <Line type="monotone" dataKey="expenditure" stroke="#161b22" strokeWidth={1.8} dot={false} isAnimationActive={false} />
                        {hasContrib && <Line type="monotone" dataKey="outgoings" stroke="#5b6573" strokeWidth={1.4} strokeDasharray="5 3" dot={false} isAnimationActive={false} />}
                      </ComposedChart>
                  </div>
                  <div className="rep-legend">
                    <span><i style={{ background: INCOME_LEGEND }} /> Income</span>
                    <span><i style={{ background: "#e0a23a" }} /> Drawn from savings</span>
                    {reportCashGap && reportCashGap.uncoveredCount > 0 && <span><i style={{ background: "#d64545" }} /> Shortfall</span>}
                    <span><i className="rep-solid" /> Total spending</span>
                    {hasContrib && <span><i className="rep-dash" /> + savings/contributions</span>}
                  </div>
                  <RepFoot />
                </section>
                </>)}

                {/* Cash gap */}
                {on("cashgap") && reportCashGap && (
                  <section className="report-page">
                  <RepHead />
                    <h2 className="rep-h2">Cash gap analysis</h2>
                    {reportCashGap.none ? (
                      <p className="rep-p rep-lede">Income covers spending in every year of the plan. Savings and investments are never drawn upon under the current assumptions.</p>
                    ) : reportCashGap.oneOffOnly ? (<>
                      <p className="rep-p rep-lede">Income covers <b>regular</b> spending in every year of the plan. Savings are drawn on only for one-off costs.</p>
                      <table className="rep-table">
                        <tbody>
                          <tr><td>Years with a one-off draw</td><td className="r num">{reportCashGap.isolatedYears.join(", ")}</td></tr>
                          <tr><td>Largest draw</td><td className="r num">{m(reportCashGap.peakDraw)} ({reportCashGap.peakYear})</td></tr>
                          <tr><td>Total drawn over the plan</td><td className="r num">{m(reportCashGap.totalDrawn)}</td></tr>
                          {reportCashGap.uncoveredCount > 0 && <tr><td>Years where the gap cannot be met</td><td className="r num"><b className="rep-gap-fig">{reportCashGap.uncoveredCount}, starting {reportCashGap.firstUncoveredYear}</b></td></tr>}
                        </tbody>
                      </table>
                      <p className="rep-p">These appear as isolated orange bars on the money chart; there is no sustained reliance on savings. Figures in {basis.toLowerCase()}.</p>
                    </>) : (<>
                      <p className="rep-p rep-lede">From <b className="num">{reportCashGap.firstYear}</b>, spending begins to exceed income. The gap is met by drawing on savings and investments.</p>
                      <table className="rep-table">
                        <tbody>
                          <tr><td>First sustained draw on savings</td><td className="r num">{reportCashGap.firstYear}</td></tr>
                          <tr><td>Typical annual draw (first five years)</td><td className="r num">{m(reportCashGap.avgDraw)}</td></tr>
                          <tr><td>Largest annual draw</td><td className="r num">{m(reportCashGap.peakDraw)} ({reportCashGap.peakYear})</td></tr>
                          <tr><td>Total drawn over the plan</td><td className="r num">{m(reportCashGap.totalDrawn)}</td></tr>
                          {reportCashGap.uncoveredCount > 0 && <tr><td>Years where the gap cannot be met</td><td className="r num"><b className="rep-gap-fig">{reportCashGap.uncoveredCount}, starting {reportCashGap.firstUncoveredYear}</b></td></tr>}
                        </tbody>
                      </table>
                      <p className="rep-p">{reportCashGap.uncoveredCount > 0 ? "Where the gap cannot be met, spending in those years exceeds both income and remaining accessible assets — shown in red on the money chart." : "Every gap year is fully met from accessible assets under the current assumptions."} Figures in {basis.toLowerCase()}.</p>
                    </>)}
                    {stressActive && <p className="rep-p rep-small">Computed on the base plan — the active stress scenario is reported on its own page.</p>}
                    <RepFoot />
                  </section>
                )}

                {/* Stress test */}
                {on("stress") && stressImpact && (() => {
                  // Build a comparison dataset: base, stressed, and the shaded gap between them.
                  // The gap is stacked on top of an invisible "floor" at the stressed value, so the
                  // shaded band literally fills the space the stress scenario has cost the plan.
                  const sData = data.map((d) => {
                    const base = d.netWorth ?? 0;
                    const stressed = d.stressed ?? base;
                    const floor = Math.min(base, stressed);
                    return { ...d, _floor: floor, _gap: Math.max(0, base - stressed) };
                  });
                  const endRow = sData[sData.length - 1] || {};
                  const endGap = Math.max(0, (endRow.netWorth ?? 0) - (endRow.stressed ?? 0));
                  return (
                  <section className="report-page">
                  <RepHead />
                    <h2 className="rep-h2">Stress test</h2>
                    <p className="rep-p rep-lede">Scenario applied: <b>{stressImpact.label}</b></p>
                    {(() => {
                      const sc = !ci && !survivorOverlay ? stressById(stress) : null;
                      if (!sc) return null;
                      const affTxt = sc.mode === "absolute"
                        ? "equities and pension funds (historical sequences don't apply to cash or property)"
                        : stressCfg.affects === "all" ? "all asset types" : "equities and pension funds (cash and property are held steady)";
                      const basis = sc.group === "historical"
                        ? `This applies an illustrative annual-return sequence reflecting the shape of the episode to ${affTxt}. It is a stylised representation, not point-accurate index data, and not a forecast.`
                        : sc.id === "custom"
                          ? `This applies the adviser-entered annual returns to ${affTxt}.`
                          : `This applies the stated reduction to the assumed growth rate of ${affTxt}.`;
                      return <p className="rep-p rep-sub">{basis}</p>;
                    })()}
                    <table className="rep-table">
                      <tbody>
                        <tr><td>Base plan</td><td className="r">{stressImpact.baseAge ? `Funds to age ${stressImpact.baseAge}` : "Funded for life"}</td></tr>
                        <tr><td>Under this scenario</td><td className="r">{stressImpact.stressAge ? `Funds to age ${stressImpact.stressAge}` : "Still funded for life"}</td></tr>
                        <tr><td>Net worth gap at plan end ({endRow.year || kpis.endYear})</td><td className="r"><b className="rep-gap-fig">{endGap > 0 ? m(endGap) : "—"}</b></td></tr>
                      </tbody>
                    </table>
                    <p className="rep-p">{!stressImpact.stressAge ? "Under this scenario the plan remains funded to the end of the projection." : stressImpact.baseAge ? `The scenario brings the projected depletion forward from age ${stressImpact.baseAge} to age ${stressImpact.stressAge}.` : `The scenario moves the plan from fully funded to depleting at age ${stressImpact.stressAge}.`} The shaded band below shows how far the stressed plan falls behind the base plan over time. This is a what-if illustration of resilience, not a prediction.</p>
                    <div className="rep-chart">
                      <ComposedChart width={700} height={260} data={sData} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                        <defs>
                          <linearGradient id="stressGapFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#d64545" stopOpacity={0.26} />
                            <stop offset="100%" stopColor="#d64545" stopOpacity={0.08} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#eceff3" vertical={false} />
                        <XAxis dataKey="year" tick={{ fill: "#6b7480", fontSize: 10 }} axisLine={{ stroke: "#dfe3e9" }} tickLine={false} interval={Math.max(0, Math.floor(sData.length / 9))} />
                        <YAxis tickFormatter={(v) => fmtCompact(v, cur)} tick={{ fill: "#6b7480", fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
                        {/* invisible floor at the stressed value, then the shaded gap stacked on top */}
                        <Area type="monotone" dataKey="_floor" stackId="gap" stroke="none" fill="none" isAnimationActive={false} />
                        <Area type="monotone" dataKey="_gap" stackId="gap" stroke="none" fill="url(#stressGapFill)" isAnimationActive={false} />
                        <Line type="monotone" dataKey="netWorth" stroke="#161b22" strokeWidth={1.7} dot={false} isAnimationActive={false} />
                        <Line type="monotone" dataKey="stressed" stroke="#d64545" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                      </ComposedChart>
                    </div>
                    <div className="rep-legend"><span><i className="rep-solid" /> Base plan net worth</span><span><i className="rep-solid" style={{ background: "#d64545" }} /> Under the scenario</span><span><i style={{ background: "#f3cccc" }} /> Shortfall vs base plan</span></div>
                    <RepFoot />
                  </section>
                  );
                })()}

                {/* Plan confidence (Monte Carlo) */}
                {on("mcconf") && (() => {
                  const fresh = mcResult && mcResult.sig === mcSig;
                  const hasAny = !!mcResult;
                  const result = fresh ? mcResult : (hasAny ? mcResult : null); // show stale if fresh not ready
                  if (!result) {
                    // No result at all yet — still computing
                    return (
                      <section className="report-page">
                  <RepHead />
                        <h2 className="rep-h2">Plan confidence</h2>
                        <p className="rep-p rep-lede">Running simulation… {Math.round(mcRun.progress * 100)}%</p>
                        <RepFoot />
                      </section>
                    );
                  }
                  const d0 = (v, y) => (showReal ? v / Math.pow(1 + inflDec, y) : v);
                  const fd = result.fan.map((f) => ({ year: f.year, band80: [d0(f.p10, f.y), d0(f.p90, f.y)], band50: [d0(f.p25, f.y), d0(f.p75, f.y)], p50: d0(f.p50, f.y) }));
                  const endF = result.fan[result.fan.length - 1];
                  const lvl = (MC_LEVELS.find((l) => l.id === result.level) || MC_LEVELS[1]).label.toLowerCase();
                  const p = Math.round(result.prob);
                  return (
                    <section className="report-page">
                  <RepHead />
                      <h2 className="rep-h2">Plan confidence</h2>
                      {!fresh && <p className="rep-p rep-sub" style={{color:"var(--amber)"}}>Note: this result was computed on a previous version of the plan. A fresh simulation is running in the background.</p>}
                      <p className="rep-p rep-lede">Across <b>{MC_RUNS}</b> simulated futures with market returns varied around the plan's assumptions ({lvl} volatility), <b>{p}%</b> keep the plan funded for life.</p>
                      <p className="rep-p rep-sub">The main projection assumes returns arrive smoothly each year. This test varies them &#8212; modelling good and bad runs of markets, including a poor run early in retirement &#8212; and counts how often the plan still holds.</p>
                      <table className="rep-table">
                        <tbody>
                          <tr><td>Simulations remaining funded for life</td><td className="r"><b>{p}%</b></td></tr>
                          <tr><td>Spendable assets at {endF.year} &#8212; downside (lowest 10%)</td><td className="r">{m(d0(endF.p10, endF.y))}</td></tr>
                          <tr><td>Spendable assets at {endF.year} &#8212; median</td><td className="r">{m(d0(endF.p50, endF.y))}</td></tr>
                          <tr><td>Spendable assets at {endF.year} &#8212; upside (highest 10%)</td><td className="r">{m(d0(endF.p90, endF.y))}</td></tr>
                        </tbody>
                      </table>
                      <div className="rep-chart">
                        <ComposedChart width={700} height={250} data={fd} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                          <CartesianGrid stroke="#eceff3" vertical={false} />
                          <XAxis dataKey="year" tick={{ fill: "#6b7480", fontSize: 10 }} axisLine={{ stroke: "#dfe3e9" }} tickLine={false} interval={Math.max(0, Math.floor(fd.length / 9))} />
                          <YAxis tickFormatter={(v) => fmtCompact(v, cur)} tick={{ fill: "#6b7480", fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
                          <Area type="monotone" dataKey="band80" stroke="none" fill="#2f6fb0" fillOpacity={0.13} isAnimationActive={false} />
                          <Area type="monotone" dataKey="band50" stroke="none" fill="#2f6fb0" fillOpacity={0.26} isAnimationActive={false} />
                          <Line type="monotone" dataKey="p50" stroke="#2f6fb0" strokeWidth={2.2} dot={false} isAnimationActive={false} />
                        </ComposedChart>
                      </div>
                      <div className="rep-legend"><span><i style={{ background: "#2f6fb0", opacity: 0.26 }} /> Middle 50% of outcomes</span><span><i style={{ background: "#2f6fb0", opacity: 0.13 }} /> Middle 80%</span><span><i className="rep-solid" style={{ background: "#2f6fb0" }} /> Median path</span></div>
                      <p className="rep-p rep-sub">Spendable assets exclude property, in {showReal ? "today's money" : "future money"}. Returns are modelled as normal variation with a shared market factor; real markets carry occasional larger shocks, so this is an indicator of resilience, not a precise probability or a forecast.</p>
                      <RepFoot />
                    </section>
                  );
                })()}

                {/* Protection snapshot */}
                {on("protection") && (protSnap || protGap) && (
                  <section className="report-page">
                  <RepHead />
                    <h2 className="rep-h2">Protection</h2>
                    {protection.length === 0
                      ? <p className="rep-p rep-lede">Policies in force: <b>none</b> — no cover is currently recorded. The benchmark below measures the full gap on that basis.</p>
                      : <p className="rep-p rep-lede">Policies in force: <b>{protection.length} polic{protection.length === 1 ? "y" : "ies"}</b>{protSnap ? ` — ${Object.entries(protSnap.per).map(([k, v]) => `${insuredLabel(k)}: ${m(v.total)}`).join("; ")}` : ""}.</p>
                    }
                    {protection.length > 0 && <table className="rep-table">
                      <thead><tr><th>Policy</th><th>Insured</th><th>Type</th><th className="r">Sum assured</th><th className="r">Premium</th><th className="r">Cover to</th></tr></thead>
                      <tbody>{protection.map((p2) => <tr key={p2.id}><td>{p2.name}</td><td>{insuredLabel(p2.insured)}</td><td>{(p2.ptype || "life") === "ci" ? "Critical illness" : "Life"}</td><td className="r num">{m(Number(p2.sumAssured) || 0)}</td><td className="r num">{sym}{(Number(p2.premium) || 0).toLocaleString()}/mo</td><td className="r num">{Number(p2.coverToAge) >= 110 ? "Whole of life" : `Age ${p2.coverToAge}`}</td></tr>)}</tbody>
                    </table>}
                    {protGap && (<>
                      <h2 className="rep-h2" style={{ marginTop: 22 }}>Protection gap analysis</h2>
                      <table className="rep-table">
                        <thead><tr><th></th><th className="r">Income/yr</th><th className="r">Life {protMult.life}× benchmark</th><th className="r">In force</th><th className="r">Life gap</th><th className="r">CI {protMult.ci}× benchmark</th><th className="r">In force</th><th className="r">CI gap</th></tr></thead>
                        <tbody>
                          {protGap.bench.map((b) => (
                            <tr key={b.k}><td>{b.k === "client2" ? dfn2 : dfn1}</td><td className="r num">{m(b.inc)}</td><td className="r num">{m(b.lifeNeed)}</td><td className="r num">{m(b.lifeHave)}</td><td className="r num">{b.lifeGap > 0 ? <b className="rep-gap-fig">{m(b.lifeGap)}</b> : "—"}</td><td className="r num">{m(b.ciNeed)}</td><td className="r num">{m(b.ciHave)}</td><td className="r num">{b.ciGap > 0 ? <b className="rep-gap-fig">{m(b.ciGap)}</b> : "—"}</td></tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="rep-p rep-small">Benchmarks are a rule-of-thumb starting point ({protMult.life}× income for life cover, {protMult.ci}× for critical illness; joint income split equally). They are not a needs analysis.</p>
                      {protGap.survivor && protGap.survivor.map((sv) => {
                        const svName = sv.k === "client2" ? dfn2 : dfn1;
                        return (
                          <p className="rep-p" key={sv.k}>
                            If {svName} died at age {sv.dAge}: existing cover of {m(sv.payout)} would pay out, and the survivor's plan{" "}
                            {sv.funded
                              ? "remains funded to the end of the projection"
                              : <>runs short from {sv.firstShortYear} by <b className="rep-gap-fig">{m(sv.totalShortReal)}</b> in total (today's money){" "}&#8212; additional cover of{" "}<b className="rep-gap-fig">{sv.closeGap === Infinity ? "more than " + m(20000000) : "approximately " + m(Math.ceil(sv.closeGap / 10000) * 10000)}</b> at death would close the gap</>
                            }.
                          </p>
                        );
                      })}
                    </>)}
                    {protSnap && protSnap.firstDeath && (
                      <p className="rep-p">{protSnap.firstDeath.payout > 0
                        ? `At the first death assumed in this plan (${insuredLabel(protSnap.firstDeath.who)}, ${protSnap.firstDeath.year}), cover totalling ${m(protSnap.firstDeath.payout)} pays out — this payment is included in the projection.`
                        : `At the first death assumed in this plan (${insuredLabel(protSnap.firstDeath.who)}, ${protSnap.firstDeath.year}), no recorded cover pays out — the policy terms end before that age.`}</p>
                    )}
                    <p className="rep-p">This section records the cover in force and how it interacts with this projection. A full protection-needs analysis is a separate exercise.</p>
                    <RepFoot />
                  </section>
                )}

                {/* What-if answers */}
                {on("whatif") && goal && (
                  <section className="report-page">
                  <RepHead />
                    <h2 className="rep-h2">"What if I asked…"</h2>
                    <p className="rep-p">Single-question answers computed from this plan. Each changes one input only, holding everything else constant — read the note beneath the table.</p>
                    <table className="rep-table">
                      <tbody>
                        <tr><td>How much could I spend each year and still be funded for life?</td><td className="r num">{goal.maxSpend != null ? `~${m(goal.maxSpend)}/yr` : "—"}</td></tr>
                        <tr><td>When could I retire at today's spending?</td><td className="r num">{goal.earliestRetAge != null ? `Age ${goal.earliestRetAge}${goal.retireMargin != null && goal.retireMargin > 0 ? ` (≈${m(goal.retireMargin)} estate)` : ""}` : "—"}</td></tr>
                        <tr><td>Largest one-off purchase today, from liquid assets (safe / maximum)</td><td className="r num">{goal.oneOff && goal.oneOff.liquidToday > 0 ? (goal.oneOff.safe > 0 ? `~${m(goal.oneOff.safe)} / ${m(goal.oneOff.max)}` : `none safely / ~${m(goal.oneOff.max)} max`) : "\u2014"}</td></tr>
                        <tr><td>Largest new permanent monthly cost, staying funded?</td><td className="r num">{goal.maxMonthly != null ? `~${sym}${Math.round(goal.maxMonthly).toLocaleString()}/mo` : "—"}</td></tr>
                        {!goal.to100 && goal.growth != null && <tr><td>Return uplift needed to fully fund the plan</td><td className="r num">+{goal.growth.toFixed(1)} pts on all assets</td></tr>}
                        {goal.fundedNow && goal.inflMax != null && <tr><td>Inflation the plan can absorb before running short</td><td className="r num">{goal.inflCapped ? `well over ${(goal.baseInfl + goal.inflMax).toFixed(1)}%` : `up to ~${(goal.baseInfl + goal.inflMax).toFixed(1)}%/yr`}</td></tr>}
                        {goal.propRelease && <tr><td>Releasing property ({m(goal.propRelease.propVal)})</td><td className="r num">{!goal.fundedNow ? (goal.propRelease.nowFunded ? "fully funds the plan" : goal.propRelease.depAge ? `extends to age ${goal.propRelease.depAge}` : "partial help") : `estate \u2192 ~${m(goal.propRelease.estate)}`}</td></tr>}
                        <tr><td>Projected estate at the end of the plan</td><td className="r num">{m(goal.estateEnd)} ({goal.estateEndYear})</td></tr>
                      </tbody>
                    </table>
                    {retGoalCalc && (<>
                      <h2 className="rep-h2" style={{ marginTop: 22 }}>Retirement income goal</h2>
                      <p className="rep-p">Target income of <b>{m(retGoalCalc.target)}/yr</b> at a {retGoalCalc.swr}% sustainable withdrawal rate.</p>
                      <table className="rep-table">
                        <tbody>
                          <tr><td>Capital required</td><td className="r num">{m(retGoalCalc.requiredCapital)}</td></tr>
                          <tr><td>Projected investable capital at retirement</td><td className="r num">{m(retGoalCalc.projInvestable)}</td></tr>
                          {retGoalCalc.onTrack
                            ? <tr><td>Status</td><td className="r"><b style={{ color: "#1b7a4b" }}>On track</b></td></tr>
                            : <><tr><td>Capital gap</td><td className="r num"><b className="rep-gap-fig">{m(retGoalCalc.capitalGap)}</b></td></tr>
                               {retGoalCalc.monthly != null && retGoalCalc.yearsToRet > 0 && <tr><td>Additional saving to close the gap</td><td className="r num"><b className="rep-gap-fig">{sym}{Math.ceil(retGoalCalc.monthly).toLocaleString()}/mo</b></td></tr>}</>}
                          <tr><td>Pot alone, drawing {m(retGoalCalc.target)}/yr</td><td className="r num">{retGoalCalc.sustainable ? "self-sustaining" : retGoalCalc.depleteAge != null ? `lasts to ~age ${retGoalCalc.depleteAge}` : "\u2014"}</td></tr>
                        </tbody>
                      </table>
                      <p className="rep-p rep-small">Figures in today's money; investable capital excludes property. The required capital applies the stated withdrawal rate as a rule of thumb. The 'pot alone, lasts to ~age' line assumes the pot is invested for income at the real return of any investments and pensions (or a balanced default if none) and drawn on its own, with no other income — so it can differ from the plan's full year-by-year projection elsewhere in this report. A planning illustration, not a recommendation or a guarantee of sustainable income.</p>
                    </>)}
                    <RepFoot />
                  </section>
                )}

                {/* Detailed inputs */}
                {on("inputs") && (<>
                <section className="report-page">
                  <RepHead />
                  <h2 className="rep-h2">Assets</h2>
                  <table className="rep-table">
                    <thead><tr><th>Asset</th><th>Owner</th><th>Type</th><th className="r">Current value</th><th className="r">Growth</th><th className="r">At retirement</th></tr></thead>
                    <tbody>
                      {assets.length === 0 ? <tr><td colSpan={6} className="rep-empty">No assets entered.</td></tr> : assets.map((a) => (
                        <tr key={a.id}><td>{a.name}{a.offshoreBond ? " (offshore bond)" : ""}</td><td>{ownerLabel(a.owner)}</td><td>{TYPE_LABEL[a.type]}</td><td className="r num">{m(Number(a.value) || 0)}</td><td className="r num">{Number(a.growthRate) || 0}%</td><td className="r num">{retRow ? m(retRow[aKey(a.id)] || 0) : "—"}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  <h2 className="rep-h2" style={{ marginTop: 26 }}>Income</h2>
                  <table className="rep-table">
                    <thead><tr><th>Source</th><th>Owner</th><th className="r">Amount</th><th>Frequency</th><th>From</th><th>To</th><th>Increases</th></tr></thead>
                    <tbody>
                      {incomes.length === 0 ? <tr><td colSpan={7} className="rep-empty">No income entered.</td></tr> : incomes.map((i) => (
                        <tr key={i.id}><td>{i.name}</td><td>{ownerLabel(i.owner)}</td><td className="r num">{sym}{(Number(i.amount) || 0).toLocaleString()}</td><td>{freqTxt(i)}</td><td>{anchorTxt(i.start, i.owner)}</td><td>{i.frequency === "oneoff" ? "—" : anchorTxt(i.end, i.owner)}</td><td>{escTxt(i)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  <RepFoot />
                </section>
                <section className="report-page">
                  <RepHead />
                  <h2 className="rep-h2">Expenditure</h2>
                  <table className="rep-table">
                    <thead><tr><th>Item</th><th>Owner</th><th className="r">Amount</th><th>Frequency</th><th>From</th><th>To</th><th>Priority</th></tr></thead>
                    <tbody>
                      {expenses.length === 0 ? <tr><td colSpan={7} className="rep-empty">No expenditure entered.</td></tr> : expenses.map((e) => (
                        <tr key={e.id}><td>{e.name}</td><td>{ownerLabel(e.owner)}</td><td className="r num">{sym}{(Number(e.amount) || 0).toLocaleString()}</td><td>{freqTxt(e)}</td><td>{anchorTxt(e.start, e.owner)}</td><td>{e.frequency === "oneoff" ? "—" : anchorTxt(e.end, e.owner)}</td><td>{e.priority === "discretionary" ? "Discretionary" : "Essential"}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  {liabilities.length > 0 && <>
                    <h2 className="rep-h2" style={{ marginTop: 26 }}>Liabilities</h2>
                    <table className="rep-table">
                      <thead><tr><th>Liability</th><th>Owner</th><th className="r">Balance</th><th className="r">Rate</th><th className="r">Monthly payment</th></tr></thead>
                      <tbody>{liabilities.map((L) => <tr key={L.id}><td>{L.name}</td><td>{ownerLabel(L.owner)}</td><td className="r num">{m(Number(L.balance) || 0)}</td><td className="r num">{Number(L.rate) || 0}%</td><td className="r num">{sym}{(Number(L.monthlyPayment) || 0).toLocaleString()}</td></tr>)}</tbody>
                    </table>
                  </>}
                  <RepFoot />
                </section>
                </>)}

                {/* Assumptions */}
                {on("assumptions") && (
                  <section className="report-page">
                  <RepHead />
                    <h2 className="rep-h2">Key assumptions</h2>
                    <table className="rep-table">
                      <tbody>
                        <tr><td>Inflation</td><td className="r num">{assumptions.inflation}%</td></tr>
                        {couple && <tr><td>Surviving partner's spending</td><td className="r num">{assumptions.survivorExpenseFactor}% of joint costs</td></tr>}
                        {riskOwnerKeys.map((k) => { const pid = riskProfiles[k]; const pr = riskProfileById(pid); return pr ? <tr key={k}><td>Risk profile — {k === "joint" ? "Joint assets" : (anon ? (k === "client1" ? "Client 1" : "Client 2") : riskOwnerLabel(k))}</td><td className="r">{pr.label}{riskDrift[k] ? " (since edited per asset)" : ""}</td></tr> : null; })}
                        <tr><td>Tax treatment</td><td className="r">{assumptions.tax && assumptions.tax.enabled ? "Illustrative tax applied (see note)" : "Not applied — figures as entered"}</td></tr>
                        <tr><td>Figures shown in</td><td className="r">{basis}</td></tr>
                      </tbody>
                    </table>
                    {annotations.length > 0 && <>
                      <h2 className="rep-h2" style={{ marginTop: 26 }}>Plan timeline notes</h2>
                      <ul className="rep-notes">{annotations.slice().sort((a, b) => a.year - b.year).map((n) => <li key={n.id}><b className="num">{n.year}</b> — {n.text || "Note"}</li>)}</ul>
                    </>}
                    <RepFoot />
                  </section>
                )}

                {/* Tax overview */}
                {on("taxov") && ((assumptions.tax && assumptions.tax.enabled) || est.enabled) && (
                  <section className="report-page">
                  <RepHead />
                    <h2 className="rep-h2">Tax overview</h2>
                    {assumptions.tax && assumptions.tax.enabled && (<>
                      <p className="rep-p rep-lede">Illustrative tax applied to this plan, based on the residence timeline below. Income is treated as net unless marked gross/taxable; tax applies to gross income, pension withdrawals, investment drawdown and offshore-bond gains in periods where rates are set.</p>
                      <table className="rep-table">
                        <thead><tr><th>Residence period</th><th>From</th><th className="r">Tax-free allowance</th><th className="r">Income tax bands</th><th className="r">CGT</th></tr></thead>
                        <tbody>
                          {assumptions.tax.periods.map((p2, i) => (
                            <tr key={p2.id}><td>{p2.label || "Period " + (i + 1)}</td><td>{i === 0 || p2.startMode === "now" ? "Start of plan" : `Age ${p2.startAge} (≈${baseYear + Math.max(0, Math.round((Number(p2.startAge) || 0) - ectx.age0c1))})`}</td><td className="r num">{m(Number(p2.personalAllowance) || 0)}</td><td className="r num">{p2.bands.length === 0 ? "No income tax" : p2.bands.map((b) => `${b.rate}%${b.upTo ? ` to ${fmtCompact(Number(b.upTo), cur)}` : "+"}`).join(" · ")}</td><td className="r num">{Number(p2.cgtRate != null ? p2.cgtRate : assumptions.tax.cgtRate) || 0}%</td></tr>
                          ))}
                        </tbody>
                      </table>
                      <table className="rep-table" style={{ marginTop: 14 }}>
                        <tbody>
                          <tr><td><b>Lifetime tax over the plan</b></td><td className="r num"><b>{m(lifetimeTax)}</b></td></tr>
                        </tbody>
                      </table>
                    </>)}
                    {est.enabled && (() => { const ec = computeEstate(goal ? goal.estateEnd : kpis.endVal, est, couple); return (<>
                      <h3 className="rep-h3" style={{ marginTop: assumptions.tax && assumptions.tax.enabled ? 22 : 0 }}>Estate &amp; succession tax</h3>
                      <p className="rep-p rep-lede">An illustrative one-off tax on the estate at the end of the plan ({goal ? goal.estateEndYear : kpis.endYear}), in today's money.</p>
                      <table className="rep-table">
                        <tbody>
                          <tr><td>Projected estate at plan end</td><td className="r num">{m(ec.gross)}</td></tr>
                          <tr><td>Tax-free allowance{couple && est.transferableNrb !== false ? " (both partners combined)" : ""}</td><td className="r num">{m(ec.allowance)}</td></tr>
                          <tr><td>Estimated succession tax{Number(est.rate) ? ` (at ${Number(est.rate)}%)` : ""}</td><td className="r num">{ec.tax > 0 ? "−" : ""}{m(ec.tax)}</td></tr>
                          <tr><td><b>Net to beneficiaries</b></td><td className="r num"><b>{m(ec.net)}</b></td></tr>
                        </tbody>
                      </table>
                      <p className="rep-p rep-small">A simplified flat-allowance, single-rate illustration. It applies the residence-band taper on large estates but does not model lifetime gifts, trusts, or business and agricultural relief, and assumes the whole estate is within scope of this tax. Not estate-planning advice.</p>
                    </>); })()}
                    <p className="rep-p rep-small">Tax figures are illustrative estimates based on user-defined assumptions and should not be relied upon as tax advice. Tax treatment depends on individual circumstances and the rules of each jurisdiction, which change over time. Advice should be obtained from a qualified tax specialist.</p>
                    <RepFoot />
                  </section>
                )}

                {/* Commentary */}
                {on("commentary") && commentaryText && (
                  <section className="report-page">
                  <RepHead />
                    <h2 className="rep-h2">Commentary</h2>
                    {commentaryText.split(/\n\n+/).map((para, i) => <p className="rep-p" key={i}>{para}</p>)}
                    <RepFoot />
                  </section>
                )}

                {/* Disclaimers — always */}
                <section className="report-page report-last">
                  <RepHead />
                  <h2 className="rep-h2">Important information</h2>
                  <p className="rep-disc">This report is an illustration based on the assumptions and figures shown above, which have been provided or agreed with you. It is not a guarantee of future outcomes. Investment growth is assumed and actual returns will vary; values can fall as well as rise, and past performance is not indicative of future results.</p>
                  <p className="rep-disc">Any tax figures shown are illustrative only and do not constitute tax advice. Tax treatment depends on individual circumstances and on the rules of each relevant jurisdiction, which may change. Advice should be obtained from a qualified tax specialist before acting.</p>
                  <p className="rep-disc">Any commentary in this report describes the projection and its inputs. It is analysis of the plan as entered, not a personal recommendation, and no part of this document constitutes financial advice. Please discuss any decisions with your financial adviser.</p>
                  <p className="rep-disc">Currency: {cur}. Figures in {basis.toLowerCase()}. Prepared {reportDate}{reportCfg.adviser ? ` by ${reportCfg.adviser}` : ""}{reportCfg.firm ? `, ${reportCfg.firm}` : ""}.</p>
                  <RepFoot />
                </section>

              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }) {
  return (<div className={`stat ${tone ? "stat-" + tone : ""}`}><div className="stat-label">{label}</div><div className="stat-value num">{value}</div>{sub && <div className="stat-sub">{sub}</div>}</div>);
}

function WhatIfSlider({ label, value, min, max, step, fmt, onChange }) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  const throttled = useRafThrottle(onChange);
  return (
    <div className="wi-slider">
      <div className="wi-srow"><span className="wi-label">{label}</span><span className={`wi-val num ${local !== 0 ? "on" : ""}`}>{fmt(local)}</span></div>
      <input type="range" min={min} max={max} step={step} value={local} onChange={(e) => { const v = Number(e.target.value); setLocal(v); throttled(v); }} />
    </div>
  );
}

function InfoTip({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="infotip-wrap">
      <button type="button" className="infotip-btn" aria-label="More information" aria-expanded={open} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}><HelpCircle size={12.5} /></button>
      {open && <span className="infotip-inline">{text}</span>}
    </span>
  );
}

/* ================================================================== */
/*  STYLES                                                            */
/* ================================================================== */
const CSS = `
.app-root{font-family:'Manrope',ui-sans-serif,sans-serif;background:var(--bg);color:var(--ink);min-height:100%;width:100%;-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;}
.app-root *{box-sizing:border-box;}
.num{font-family:'Manrope',ui-sans-serif,sans-serif;font-variant-numeric:tabular-nums;}
/* Micro-interactions — shared press/hover feel across every action control */
.add-btn,.goal-btn,.wi-reset,.xc-btn,.scen-btn,.pg-chart-btn,.report-btn,.add-band,.scen-del,.rec-del,.del-row,.tax-presets button{transition:transform .1s ease,border-color .15s ease,color .15s ease,background .15s ease,box-shadow .15s ease;}
.add-btn:active,.goal-btn:active,.wi-reset:active,.xc-btn:active,.scen-btn:active,.pg-chart-btn:active,.report-btn:active,.add-band:active,.tax-presets button:active{transform:scale(.97);}
.rec:hover{border-color:var(--border-strong);}
/* Consistent focus rings for keyboard users */
.pick:focus-visible,.rec-name:focus-visible,.money-in:focus-visible,.notes-area:focus-visible,.scen-name:focus-visible,.tax-label-in:focus-visible{outline:2px solid var(--accent);outline-offset:1px;border-radius:6px;}
.add-btn:focus-visible,.goal-btn:focus-visible,.wi-reset:focus-visible,.xc-btn:focus-visible,.scen-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}

.topbar{display:flex;align-items:center;justify-content:space-between;padding:12px 20px;border-bottom:1px solid var(--border);background:var(--panel);position:sticky;top:0;z-index:30;flex:none;}
.brand{display:flex;align-items:center;gap:11px;}
.brand-mark{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;background:var(--bg);border:1px solid var(--border);}
.brand-text{display:flex;flex-direction:column;line-height:1.12;}
.brand-name{font-family:'Manrope',serif;font-weight:600;font-size:19px;letter-spacing:-0.01em;}
.brand-tag{font-size:11.5px;color:var(--mid);}
.topbar-tools{display:flex;align-items:center;gap:9px;}
.cur-sel{background:var(--bg);border:1px solid var(--border);color:var(--ink);border-radius:8px;padding:7px 9px;font-size:12.5px;cursor:pointer;}
.icon-btn{background:var(--bg);border:1px solid var(--border);color:var(--mid);border-radius:8px;width:34px;height:34px;display:grid;place-items:center;cursor:pointer;transition:.15s;}
.icon-btn:hover{color:var(--ink);border-color:var(--border-strong);}
.btn-primary{display:flex;align-items:center;gap:7px;background:var(--accent-strong);color:#fff;border:none;border-radius:8px;padding:8px 13px;font-size:13px;font-weight:600;cursor:pointer;transition:.15s;}
.btn-primary:hover{filter:brightness(1.08);}

.app{display:grid;grid-template-columns:204px 360px 1fr;align-items:start;}
.app.present{grid-template-columns:1fr;}

.rail{background:var(--rail);border-right:1px solid var(--border);padding:16px 12px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;}

.rail-group{display:flex;flex-direction:column;gap:3px;}
.rail-item{display:flex;align-items:center;gap:11px;width:100%;background:transparent;border:none;color:var(--mid);padding:9px 11px;border-radius:9px;font-size:13.5px;font-weight:500;cursor:pointer;font-family:inherit;transition:.13s;text-align:left;}
.rail-item:hover{background:var(--accent-soft);color:var(--ink);}
.rail-item.active{background:var(--accent-strong);color:#fff;}
.rail-item.soon{cursor:default;opacity:.5;}
.rail-item.soon:hover{background:transparent;color:var(--mid);}
.soon-pill{margin-left:auto;font-size:9.5px;font-weight:600;letter-spacing:.04em;background:var(--border);color:var(--mid);padding:2px 6px;border-radius:5px;text-transform:uppercase;}
.rail-divider{height:1px;background:var(--border);margin:4px 6px;}

.tabbar{display:none;gap:6px;padding:10px 14px;border-bottom:1px solid var(--border);background:var(--panel);overflow-x:auto;}
.tab{display:flex;align-items:center;gap:6px;white-space:nowrap;background:var(--bg);border:1px solid var(--border);color:var(--mid);padding:7px 12px;border-radius:8px;font-size:12.5px;font-weight:500;font-family:inherit;cursor:pointer;}
.tab.active{background:var(--accent-strong);color:#fff;border-color:var(--accent-strong);}

.editor{border-right:1px solid var(--border);background:var(--panel);overflow:visible;scrollbar-width:thin;scrollbar-color:var(--border-strong) transparent;}
.editor::-webkit-scrollbar,.rail::-webkit-scrollbar,.chartwrap::-webkit-scrollbar,.modal::-webkit-scrollbar,.notes-area::-webkit-scrollbar{width:8px;height:8px;}
.editor::-webkit-scrollbar-thumb,.rail::-webkit-scrollbar-thumb,.chartwrap::-webkit-scrollbar-thumb,.modal::-webkit-scrollbar-thumb,.notes-area::-webkit-scrollbar-thumb{background:var(--border-strong);border-radius:8px;border:2px solid transparent;background-clip:content-box;}
.editor::-webkit-scrollbar-thumb:hover{background:var(--low);border:2px solid transparent;background-clip:content-box;}
.editor::-webkit-scrollbar-track,.rail::-webkit-scrollbar-track,.chartwrap::-webkit-scrollbar-track,.modal::-webkit-scrollbar-track,.notes-area::-webkit-scrollbar-track{background:transparent;}
.rail{scrollbar-width:thin;scrollbar-color:var(--border-strong) transparent;}
.chartwrap{scrollbar-width:thin;scrollbar-color:var(--border-strong) transparent;}
.ed-body{padding:18px 16px;display:flex;flex-direction:column;gap:13px;}
.ed-head{display:flex;align-items:center;justify-content:space-between;}
.ed-body > .ed-head:first-child{position:sticky;top:0;z-index:6;background:var(--panel);margin:-18px -16px 8px;padding:16px 16px 10px;border-bottom:1px solid var(--border);}
.ed-head-tools{display:flex;align-items:center;gap:8px;}
.xc-btn{background:none;border:1px solid var(--border);border-radius:7px;padding:4px 9px;font-size:11.5px;font-weight:600;color:var(--low);cursor:pointer;font-family:inherit;}
.xc-btn:hover{color:var(--ink);border-color:var(--border-strong);}
.notes-area{width:100%;min-height:260px;resize:vertical;background:var(--bg);border:1px solid var(--border);border-radius:11px;padding:12px 14px;font:inherit;font-size:13.5px;line-height:1.55;color:var(--ink);outline:none;box-sizing:border-box;}
.notes-area:focus{border-color:var(--border-strong);}
.risk-block{display:flex;flex-direction:column;gap:8px;margin-top:14px;}
.risk-row{display:flex;flex-direction:column;gap:4px;}
.risk-edited{font-style:normal;color:var(--amber);font-weight:600;}
.risk-tools{display:flex;gap:8px;margin-top:4px;}
.risk-editor{display:flex;flex-direction:column;gap:7px;border:1px solid var(--border);border-radius:11px;padding:12px 14px;margin-top:6px;}
.risk-ed-row{display:grid;grid-template-columns:78px repeat(4,1fr);gap:7px;align-items:center;}
.risk-ed-head span{font-size:10.5px;color:var(--low);font-weight:600;}
.risk-ed-name{font-size:12.5px;font-weight:600;color:var(--ink);}
.notes-tools{margin-bottom:8px;}
.pg-block{margin-top:16px;border-top:1px solid var(--border);padding-top:14px;display:flex;flex-direction:column;gap:8px;}
.pg-card{border:1px solid var(--border);border-radius:11px;padding:11px 13px;display:flex;flex-direction:column;gap:4px;background:var(--bg);}
.pg-card-name{font-size:13px;font-weight:600;color:var(--ink);display:flex;align-items:center;gap:7px;margin-bottom:3px;}
.pg-inc{font-weight:400;font-size:11.5px;color:var(--low);}
.pg-row{display:flex;justify-content:space-between;font-size:12.5px;color:var(--mid);gap:10px;}
.pg-row .num{color:var(--ink);}
.pg-verdict{font-weight:600;border-top:1px dashed var(--border);padding-top:4px;margin-top:2px;}
.pg-ok span{color:var(--green);}
.pg-gap span{color:var(--amber);}
.pg-close{font-weight:600;}
.pg-close .num{color:var(--green);}
.pg-mult{display:flex;flex-direction:column;gap:5px;margin-top:2px;}
.pg-mult-row{display:flex;align-items:center;gap:8px;}
.pg-mult-row label{font-size:11.5px;color:var(--low);}
.pg-surv{display:flex;flex-direction:column;gap:8px;}
.ci-hint{font-size:12px;color:var(--mid);display:flex;align-items:center;gap:8px;margin-top:6px;}
.pg-chart-btn{margin-top:6px;background:none;border:1px solid var(--border);border-radius:7px;padding:5px 10px;font-size:11.5px;font-weight:600;color:var(--low);cursor:pointer;font-family:inherit;width:100%;text-align:left;}
.pg-chart-btn:hover{border-color:var(--accent);color:var(--accent);}
.pg-chart-btn-on{border-color:var(--red);color:var(--red);}
.pg-chart-btn-on:hover{border-color:var(--red);color:var(--red);}
.pg-surv-slider{display:flex;align-items:center;gap:9px;margin:1px 0 5px;}
.pg-surv-slider input[type=range]{flex:1;accent-color:var(--accent);height:18px;cursor:pointer;}
.pg-surv-ages{font-size:10.5px;color:var(--low);font-variant-numeric:tabular-nums;flex-shrink:0;}
.pg-surv-mode{margin:0 0 6px;}
.pg-surv-range{font-size:11.5px;line-height:1.45;color:var(--mid);background:var(--track);border-radius:7px;padding:7px 9px;margin-top:5px;}
.scen-row{display:flex;align-items:center;gap:7px;border:1px solid var(--border);border-radius:10px;padding:8px 10px;background:var(--bg);}
.scen-row.on{border-color:var(--accent);}
.scen-name{flex:1;min-width:0;background:none;border:none;outline:none;font:inherit;font-size:13px;font-weight:600;color:var(--ink);}
.scen-chip{font-size:10px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;padding:3px 7px;border-radius:6px;}
.scen-chip-on{background:var(--accent-soft,#eef3fb);color:var(--accent);}
.scen-btn{background:none;border:1px solid var(--border);border-radius:7px;padding:4px 9px;font-size:11.5px;font-weight:600;color:var(--low);cursor:pointer;font-family:inherit;white-space:nowrap;}
.scen-btn:hover{color:var(--ink);border-color:var(--border-strong);}
.scen-btn-cmp{border-color:hsl(185 70% 42%);color:hsl(185 70% 42%);}
.scen-del{background:none;border:none;color:var(--low);cursor:pointer;padding:3px;display:flex;}
.scen-del:hover{color:var(--red);}
.chart-cmp{margin-top:5px;font-size:11.5px;color:var(--mid);display:flex;align-items:center;gap:6px;}
.chart-cmp i{width:14px;height:0;border-top:2.5px solid hsl(185 70% 42%);display:inline-block;}
.chart-cmp b{color:var(--ink);}
.chart-cmp-x{background:none;border:1px solid var(--border);border-radius:5px;color:var(--low);cursor:pointer;font-size:11px;line-height:1;padding:2px 5px;margin-left:2px;}
.gap-card{background:var(--card);border:1px solid var(--border);border-radius:15px;padding:13px 17px 12px;display:flex;flex-direction:column;gap:9px;box-shadow:var(--shadow);}
.gap-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;}
.gap-title{font-size:13px;font-weight:600;color:var(--ink);display:inline-flex;align-items:center;gap:5px;}
.gap-sub{font-size:11px;color:var(--low);}
.gap-strip{display:flex;width:100%;height:34px;border-radius:8px;overflow:hidden;gap:2px;}
.gap-seg{display:flex;flex-direction:column;justify-content:center;padding:0 8px;min-width:6px;flex-basis:0;overflow:hidden;}
.gap-ok{background:color-mix(in srgb, var(--green) 16%, var(--card));}
.gap-draw{background:color-mix(in srgb, var(--amber) 20%, var(--card));}
.gap-short{background:color-mix(in srgb, var(--red) 20%, var(--card));}
.gap-seg-lbl{font-size:10.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.gap-ok .gap-seg-lbl{color:var(--green);}
.gap-draw .gap-seg-lbl{color:var(--amber);}
.gap-short .gap-seg-lbl{color:var(--red);}
.gap-seg-yrs{font-size:9.5px;color:var(--low);white-space:nowrap;}
.gap-stats{display:flex;flex-wrap:wrap;gap:6px 18px;}
.gap-stat{font-size:11.5px;color:var(--mid);}
.gap-stat b{color:var(--ink);font-weight:600;}
.gap-stat-ok{color:var(--green);font-weight:600;}
.gap-stat-red{color:var(--red);font-weight:600;}
.rep-gap-fig{color:#c62828;font-weight:700;}
.goalp{margin-top:14px;border:1px solid var(--border);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:9px;}
.goalp-head{display:flex;align-items:center;justify-content:space-between;}
.goalp-inputs{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.goalp-out{border-radius:10px;padding:11px 13px;display:flex;flex-direction:column;gap:8px;}
.goalp-out.on-track{background:color-mix(in srgb, var(--green) 9%, var(--card));border:1px solid color-mix(in srgb, var(--green) 28%, var(--card));}
.goalp-out.gap{background:color-mix(in srgb, var(--amber) 8%, var(--card));border:1px solid color-mix(in srgb, var(--amber) 26%, var(--card));}
.goalp-verdict{font-size:12.5px;line-height:1.5;}
.goalp-verdict.ok{color:var(--green);font-weight:600;}
.goalp-verdict.short{color:var(--mid);}
.goalp-rows{display:flex;flex-direction:column;gap:4px;}
.goalp-row{display:flex;justify-content:space-between;font-size:12.5px;color:var(--mid);gap:10px;}
.goalp-row .num{color:var(--ink);}
.goalp-redfig{color:#c62828;font-weight:700;}
.tip-stress span{color:var(--red);}
.tip-stress b{color:var(--red);}
.tip-stress-delta{color:var(--red);font-weight:600;}
.tip-stress-delta .num{color:var(--red);}
.tip-bd-label{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--low);margin-bottom:2px;}
.tax-lifetime{display:flex;align-items:baseline;gap:10px;border:1px solid var(--border);border-radius:11px;padding:10px 14px;background:var(--bg);margin-top:4px;}
.tax-lifetime span{font-size:12px;color:var(--mid);}
.tax-lifetime b{font-size:16px;color:var(--ink);}
.tax-lifetime em{font-style:normal;font-size:10.5px;color:var(--low);margin-left:auto;}
.tax-disclaimer{font-size:11px;color:var(--mid);border-left:3px solid var(--amber);padding:7px 11px;background:color-mix(in srgb, var(--amber) 7%, var(--card));border-radius:0 8px 8px 0;margin-top:6px;line-height:1.5;}
.anchor-yr{font-size:11.5px;color:var(--low);white-space:nowrap;}
.ed-title{font-family:'Manrope',serif;font-size:18px;font-weight:600;margin:0;}
.add-btn{display:flex;align-items:center;gap:5px;background:var(--accent-soft);color:var(--accent);border:1px solid var(--border);border-radius:8px;padding:6px 11px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;}
.add-btn.wide{width:100%;justify-content:center;padding:9px;margin-top:4px;}
.tax-enable{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;background:var(--bg);border:1px solid var(--border);border-radius:11px;padding:13px 14px;margin-bottom:4px;}
.estate-block{margin-top:18px;border-top:1px solid var(--border);padding-top:16px;}
.estate-enable{margin-top:0;}
.estate-preview{margin-top:12px;border:1px solid var(--border);border-radius:11px;overflow:hidden;background:var(--card);}
.estate-prev-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:9px 13px;font-size:12.5px;color:var(--mid);border-bottom:1px solid var(--border);}
.estate-prev-row b{color:var(--ink);font-variant-numeric:tabular-nums;}
.estate-prev-tax b{color:var(--red);}
.estate-prev-net{border-bottom:none;background:color-mix(in srgb, var(--accent) 6%, transparent);}
.estate-prev-net span,.estate-prev-net b{color:var(--ink);font-weight:650;}
.tax-enable-title{font-size:13px;font-weight:600;color:var(--ink);}
.tax-enable-sub{font-size:11.5px;color:var(--low);line-height:1.45;margin-top:4px;}
.tax-tl-head{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--ink);letter-spacing:.02em;margin-top:4px;}
.tax-period{border:1px solid var(--border);border-radius:11px;padding:13px;display:flex;flex-direction:column;gap:11px;background:var(--card);}
.tax-period-top{display:flex;align-items:center;gap:9px;}
.tax-label-in{flex:1;min-width:0;background:var(--bg);border:1px solid var(--border);color:var(--ink);border-radius:8px;padding:7px 10px;font-size:13px;font-weight:600;font-family:inherit;}
.tax-label-in:focus{outline:none;border-color:var(--accent);}
.tax-from{font-size:11.5px;color:var(--mid);white-space:nowrap;display:inline-flex;align-items:center;gap:5px;}
.tax-yr{font-style:normal;font-size:10.5px;color:var(--low);}
.tax-age{width:52px;text-align:center;background:var(--bg);border:1px solid var(--border);color:var(--ink);border-radius:7px;padding:5px 6px;font-size:12.5px;}
.tax-presets{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px;color:var(--low);}
.tax-presets button{border:1px solid var(--border);background:var(--bg);color:var(--mid);font-family:inherit;font-size:11px;font-weight:600;padding:4px 9px;border-radius:7px;cursor:pointer;}
.tax-presets button:hover{border-color:var(--accent);color:var(--accent);}
.tax-bands{display:flex;flex-direction:column;gap:7px;}
.tax-bands-head{display:grid;grid-template-columns:1fr 1fr 28px;gap:8px;font-size:10.5px;color:var(--low);text-transform:uppercase;letter-spacing:.04em;font-weight:600;}
.tax-band{display:grid;grid-template-columns:1fr 1fr 28px;gap:8px;align-items:center;}
.tax-band-empty{font-size:11.5px;color:var(--low);font-style:italic;}
.money.sm,.mininum.sm{height:34px;}
.money.sm .money-in{font-size:12.5px;}
.add-band{align-self:flex-start;display:inline-flex;align-items:center;gap:4px;background:transparent;border:1px dashed var(--border);color:var(--mid);font-family:inherit;font-size:11.5px;font-weight:600;padding:5px 10px;border-radius:7px;cursor:pointer;}
.add-band:hover{border-color:var(--accent);color:var(--accent);}
.field{display:flex;flex-direction:column;gap:6px;}
.field label{font-size:12.5px;color:var(--mid);font-weight:500;}
.field-note{font-size:11.5px;color:var(--low);line-height:1.4;}
.surplus-primary{margin:14px 0 4px;padding:13px;border:1px solid var(--border);border-radius:12px;background:var(--bg);}
.surplus-opts{display:flex;flex-direction:column;gap:7px;margin-top:9px;}
.surplus-opt{display:flex;flex-direction:column;gap:3px;text-align:left;border:1.5px solid var(--border);border-radius:10px;padding:10px 12px;background:var(--card);cursor:pointer;font-family:inherit;transition:border-color .12s ease,background .12s ease;}
.surplus-opt:hover{border-color:var(--mid);}
.surplus-opt.on{border-color:var(--accent);background:color-mix(in srgb, var(--accent) 6%, transparent);}
.surplus-opt-top{display:flex;align-items:center;gap:9px;font-size:13.5px;font-weight:650;color:var(--ink);}
.surplus-radio{width:15px;height:15px;border-radius:50%;border:2px solid var(--border);flex-shrink:0;position:relative;transition:border-color .12s ease;}
.surplus-opt.on .surplus-radio{border-color:var(--accent);}
.surplus-opt.on .surplus-radio::after{content:"";position:absolute;inset:2.5px;border-radius:50%;background:var(--accent);}
.surplus-opt-desc{font-size:11.5px;color:var(--low);line-height:1.45;padding-left:24px;}
.surplus-dest{margin-top:11px;}
.spend-primary{margin:14px 0 4px;padding:13px;border:1px solid var(--border);border-radius:12px;background:var(--bg);}
.spend-mode{margin:9px 0 7px;}
.spend-bands{margin-top:10px;display:flex;flex-direction:column;gap:7px;}
.spend-band{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid var(--border);border-radius:9px;padding:8px 11px;background:var(--card);}
.spend-band-name{font-size:12.5px;font-weight:600;color:var(--ink);display:flex;flex-direction:column;gap:1px;}
.spend-band-name em{font-style:normal;font-size:11px;font-weight:500;color:var(--low);font-variant-numeric:tabular-nums;}
.spend-band-val{font-size:13px;font-weight:650;color:var(--mid);display:flex;flex-direction:column;align-items:flex-end;}
.spend-band-val span{font-size:10px;font-weight:500;color:var(--low);}
.spend-band-edit{flex-shrink:0;}
.spend-ages{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:3px;font-size:11.5px;color:var(--low);}
.spend-ages label{margin-left:4px;}
.spend-warn{color:var(--amber);margin-top:6px;}
.text-in{background:var(--bg);border:1px solid var(--border);color:var(--ink);border-radius:8px;padding:9px 11px;font-size:13.5px;font-family:inherit;width:100%;}
.text-in:focus,.money-in:focus,.mininum input:focus,.rec-name:focus,.pick:focus,.anchor-age:focus{outline:none;border-color:var(--accent);}
.ed-hint{font-size:11.5px;color:var(--low);line-height:1.5;margin:6px 0 0;border-top:1px solid var(--border);padding-top:12px;}
.empty-note{font-size:12.5px;color:var(--low);line-height:1.5;padding:10px 0;}

.couple-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--bg);border:1px solid var(--border);border-radius:11px;padding:12px 13px;}
.ct-title{font-size:13.5px;font-weight:600;}
.ct-sub{font-size:11px;color:var(--low);margin-top:2px;}
.client-label{font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.05em;margin-top:4px;}
.client-card{background:var(--bg);border:1px solid var(--border);border-radius:11px;padding:13px;display:flex;flex-direction:column;gap:11px;}

.rec{background:var(--bg);border:1px solid var(--border);border-radius:11px;overflow:hidden;transition:border-color .15s ease,box-shadow .15s ease;}
.rec:hover{border-color:var(--border-strong);}
.rec.open{border-color:var(--border-strong);box-shadow:var(--shadow);}
.rec-body{animation:recIn .18s cubic-bezier(.2,.7,.3,1) both;}
@keyframes recIn{from{opacity:0;transform:translateY(-4px);}to{opacity:1;transform:translateY(0);}}
@media (prefers-reduced-motion: reduce){.rec-body{animation:none;}}
.rec-bar{display:flex;align-items:center;gap:8px;width:100%;background:transparent;border:none;padding:11px 12px;cursor:pointer;font-family:inherit;text-align:left;color:var(--ink);user-select:none;outline:none;}
.rec-bar:focus-visible{box-shadow:inset 0 0 0 2px var(--accent);border-radius:10px;}
.swatch{width:11px;height:11px;border-radius:3px;flex:none;}
.rec-name-r{flex:1;font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.owner-chip{font-size:9.5px;font-weight:600;padding:2px 6px;border-radius:5px;background:var(--accent-soft);color:var(--accent);white-space:nowrap;}
.prio{font-size:9.5px;font-weight:600;padding:2px 6px;border-radius:5px;text-transform:uppercase;letter-spacing:.03em;}
.prio.essential{background:var(--accent-soft);color:var(--accent);}
.prio.discretionary{background:var(--track);color:var(--mid);}
.rec-sum{font-size:12.5px;color:var(--mid);white-space:nowrap;}
.rec-sum em{font-style:normal;color:var(--low);font-size:11px;}
.qdel{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;border-radius:6px;color:var(--low);opacity:.35;transition:opacity .12s ease,color .12s ease,background .12s ease;flex-shrink:0;cursor:pointer;}
.rec-bar:hover .qdel,.qdel:focus-visible,.qdel.armed{opacity:1;}
.qdel:hover{color:var(--red);background:color-mix(in srgb, var(--red) 9%, transparent);}
.qdel.armed{color:var(--red);background:color-mix(in srgb, var(--red) 12%, transparent);padding:0 7px;}
.clear-all{opacity:1;min-width:unset;height:22px;padding:0 7px;border:1px solid var(--border);font-size:11px;font-weight:500;}
.clear-all:hover{color:var(--red);border-color:color-mix(in srgb,var(--red) 50%,transparent);background:color-mix(in srgb,var(--red) 6%,transparent);}
.clear-all.armed{color:var(--red);border-color:var(--red);background:color-mix(in srgb,var(--red) 10%,transparent);padding:0 7px;}
.qdel em{font-style:normal;font-size:11px;font-weight:700;}
@media (hover:none){.qdel{opacity:1;}}
.chev{transition:transform .18s ease;color:var(--low);flex-shrink:0;}
.rec.open .chev{transform:rotate(180deg);}
.rec-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:13px;border-top:1px solid var(--border);animation:recIn .18s ease-out;}
@keyframes recIn{from{opacity:0;transform:translateY(-4px);}to{opacity:1;transform:translateY(0);}}
.flbl{font-size:11px;color:var(--low);font-weight:500;margin-top:11px;}
.rec-name{background:var(--panel);border:1px solid var(--border);border-radius:8px;color:var(--ink);font-size:13.5px;font-weight:600;font-family:inherit;padding:9px 10px;transition:border-color .12s ease,box-shadow .12s ease;outline:none;}
.rec-name:focus,.pick:focus,.tax-label-in:focus,.scen-name:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 11%, transparent);outline:none;}
.money:focus-within,.mininum:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 11%, transparent);}
.money,.mininum,.pick{transition:border-color .12s ease,box-shadow .12s ease;}
.add-btn,.xc-btn,.scen-btn,.pg-chart-btn,.goal-btn,.wi-reset,.report-btn,.add-band{transition:color .12s ease,border-color .12s ease,background .12s ease,box-shadow .12s ease;}
.rail-item{transition:background .12s ease,color .12s ease;}
.rec-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px;}
.rec-field{display:flex;flex-direction:column;gap:5px;min-width:0;}
.rec-field label{font-size:11px;color:var(--low);font-weight:500;}
.inl-note{font-size:10.5px;color:var(--low);font-style:italic;}
.pick{background:var(--panel);border:1px solid var(--border);color:var(--ink);border-radius:8px;padding:8px 9px;font-size:12.5px;font-family:inherit;cursor:pointer;width:100%;}
.money,.mininum{display:flex;align-items:center;background:var(--panel);border:1px solid var(--border);border-radius:8px;overflow:hidden;}
.money-sym{padding:0 7px;font-size:11px;color:var(--low);}
.money-in{flex:1;background:transparent;border:none;color:var(--ink);padding:8px 9px 8px 0;font-size:12.5px;width:100%;min-width:0;}
.mininum input{flex:1;background:transparent;border:none;color:var(--ink);padding:8px 9px;font-size:12.5px;width:100%;min-width:0;}
.mininum span{padding:0 9px 0 0;font-size:11px;color:var(--low);}
.anchor{display:flex;gap:6px;align-items:center;}
.anchor .pick{flex:1;}
.anchor-age{width:50px;background:var(--panel);border:1px solid var(--border);border-radius:8px;color:var(--ink);font-size:12.5px;padding:8px 5px;text-align:center;}
.anchor-res{font-size:12px;color:var(--low);min-width:22px;text-align:center;}
.rec-toggle{align-items:flex-start;}
.toggle{width:38px;height:22px;border-radius:999px;background:var(--track);border:none;cursor:pointer;position:relative;padding:0;transition:.15s;flex:none;}
.toggle span{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:.15s;}
.toggle.on{background:var(--accent);}
.toggle.on span{left:19px;}
.toggle.sm{width:32px;height:18px;}
.toggle.sm span{width:13px;height:13px;}
.toggle.sm.on span{left:16px;}
.contrib{background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:11px;display:flex;flex-direction:column;gap:11px;}
.contrib-head{display:flex;align-items:center;gap:9px;background:transparent;border:none;font-family:inherit;font-size:12.5px;font-weight:600;color:var(--ink);cursor:pointer;padding:0;}
.seg2{display:flex;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:3px;gap:2px;}
.seg2 button{flex:1;border:none;background:transparent;color:var(--mid);font-family:inherit;font-size:12px;font-weight:600;padding:6px;border-radius:6px;cursor:pointer;}
.seg2 button.on{background:var(--accent-strong);color:#fff;}
.del-row{display:flex;align-items:center;justify-content:center;gap:6px;background:transparent;border:1px solid var(--border);color:var(--low);border-radius:8px;padding:8px;font-size:12px;font-family:inherit;cursor:pointer;}
.del-row:hover{color:var(--red);border-color:var(--red);}

.chartwrap{padding:18px 20px;display:flex;flex-direction:column;gap:13px;min-width:0;position:sticky;top:64px;align-self:start;max-height:calc(100vh - 64px);overflow-y:auto;}
.app.present .chartwrap{padding:22px 36px;gap:16px;}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;}
.stat{background:var(--card);border:1px solid var(--border);border-radius:13px;padding:13px 15px;box-shadow:var(--shadow);}
.stat-label{font-size:11px;color:var(--mid);font-weight:600;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;}
.stat-value{font-size:26px;font-weight:650;letter-spacing:-0.022em;line-height:1.04;font-variant-numeric:tabular-nums;}
.stat-sub{font-size:11.5px;color:var(--low);margin-top:3px;}
.stat-green .stat-value{color:var(--green);} .stat-amber .stat-value{color:var(--amber);} .stat-red .stat-value{color:var(--red);}

.banner{display:flex;align-items:center;gap:10px;padding:11px 15px;border-radius:11px;font-size:13.5px;font-weight:500;border:1px solid var(--border);}
.banner svg{flex:none;}
.banner-green{background:color-mix(in srgb,var(--green) 9%,transparent);color:var(--green);border-color:color-mix(in srgb,var(--green) 26%,transparent);}
.banner-amber{background:color-mix(in srgb,var(--amber) 10%,transparent);color:var(--amber);border-color:color-mix(in srgb,var(--amber) 28%,transparent);}
.banner-red{background:color-mix(in srgb,var(--red) 9%,transparent);color:var(--red);border-color:color-mix(in srgb,var(--red) 26%,transparent);}

.chart-card{background:var(--card);border:1px solid var(--border);border-radius:15px;padding:16px 17px 14px;display:flex;flex-direction:column;box-shadow:var(--shadow);}
.chart-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;}
.chart-title{font-family:'Manrope',serif;font-size:17px;font-weight:600;}
.chart-sub{font-size:12px;color:var(--low);margin-top:1px;}
.head-toggles{display:flex;gap:8px;flex-wrap:wrap;}
.view-seg{display:flex;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:3px;gap:2px;}
.view-seg button{border:none;background:transparent;color:var(--mid);font-family:inherit;font-size:11.5px;font-weight:600;padding:5px 10px;border-radius:6px;cursor:pointer;white-space:nowrap;}
.view-seg button.on{background:var(--accent-strong);color:#fff;}
.legend{display:flex;flex-wrap:wrap;gap:13px;margin:10px 0 2px;font-size:11.5px;color:var(--mid);min-height:14px;}
.legend.sm{gap:11px;font-size:11px;margin:6px 0 2px;}
.legend span{display:flex;align-items:center;gap:6px;}
.legend i{width:10px;height:10px;border-radius:3px;}
.legend i.line-key{width:16px;height:0;border-radius:0;border-top:2px solid currentColor;background:transparent;}
.legend i.line-key.dash{border-top-style:dashed;}
.legend-tax-badge{font-size:10px;background:color-mix(in srgb,var(--amber) 15%,transparent);color:var(--amber);border:1px solid color-mix(in srgb,var(--amber) 30%,transparent);border-radius:5px;padding:1px 7px;font-weight:600;}
.legend i.line-key.dash{border-top-style:dashed;}
.chart-main{height:clamp(240px,40vh,460px);margin-top:6px;}
.chart-events{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 0;}
.evchip{display:inline-flex;align-items:center;gap:7px;font-size:11px;color:var(--mid);background:var(--bg);border:1px solid var(--border);border-radius:7px;padding:3px 9px;}
.evchip i{width:3px;height:13px;border-radius:0;flex:none;background:repeating-linear-gradient(to bottom, currentColor 0 3px, transparent 3px 6px);}
.evchip b{color:var(--ink);font-weight:600;}
.evchip.note{border-style:dashed;color:var(--mid);gap:5px;}
.evchip.inflow{background:color-mix(in srgb, var(--green) 9%, transparent);}
.note-txt{border:none;background:transparent;color:var(--ink);font-family:inherit;font-size:11px;width:90px;outline:none;}
.note-yr{border:none;background:transparent;color:var(--mid);font-family:inherit;font-size:11px;width:46px;outline:none;-moz-appearance:textfield;}
.note-yr::-webkit-outer-spin-button,.note-yr::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
.note-x{border:none;background:transparent;color:var(--low);cursor:pointer;font-size:14px;line-height:1;padding:0 2px;}
.note-x:hover{color:var(--red);}
.ev-add{display:inline-flex;align-items:center;gap:4px;border:1px dashed var(--border);background:transparent;color:var(--low);font-family:inherit;font-size:11px;font-weight:600;padding:3px 9px;border-radius:7px;cursor:pointer;}
.ev-add:hover{border-color:var(--accent);color:var(--accent);}
.goal-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--accent);background:transparent;color:var(--accent);font-family:inherit;font-size:11.5px;font-weight:600;padding:6px 11px;border-radius:8px;cursor:pointer;white-space:nowrap;}
.goal-btn:hover{background:var(--accent-strong);color:#fff;}
.goal-btn.on{background:var(--red);border-color:var(--red);color:#fff;}
.stress-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px;padding:8px 12px;border:1px solid var(--red);border-radius:9px;background:color-mix(in srgb, var(--red) 8%, transparent);}
.stress-bar-surv{border-color:var(--border-strong);background:color-mix(in srgb, var(--ink) 5%, transparent);}
.stress-bar-surv .stress-tag{color:var(--ink);}
.tip-cmp-delta{color:hsl(185 60% 38%);font-weight:600;}
.tip-cmp-delta .num{color:hsl(185 60% 38%);}
.stress-tag{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--red);}
.stress-impact{font-size:12px;color:var(--mid);}
.stress-note{font-size:11.5px;color:var(--mid);opacity:0.85;display:inline-flex;align-items:center;gap:5px;font-style:italic;}
.stress-bar .wi-reset{margin-left:auto;}
.stress-card{text-align:left;border:1px solid var(--border);border-left-width:3px;border-left-color:var(--border);border-radius:10px;padding:12px 14px;background:var(--bg);cursor:pointer;font-family:inherit;width:100%;transition:border-color .12s;}
.stress-card:hover{border-left-color:var(--red);}
.stress-card.on{border-left-color:var(--red);background:color-mix(in srgb, var(--red) 7%, transparent);}
.stress-group{margin-bottom:14px;}
.stress-group-head{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--low);margin-bottom:7px;display:flex;flex-direction:column;gap:2px;}
.stress-group-head span{font-size:11.5px;font-weight:400;text-transform:none;letter-spacing:0;color:var(--mid);}
.stress-cfg{margin-top:4px;margin-bottom:14px;padding:13px 14px;border:1px solid var(--border);border-radius:10px;background:var(--panel);}
.stress-cfg-row{display:flex;flex-wrap:wrap;gap:14px;}
.stress-cfg-row .rec-field{flex:1;min-width:150px;}
.stress-custom{margin-top:12px;}
.stress-custom-lbl{font-size:11px;color:var(--low);font-weight:500;margin-bottom:7px;}
.stress-custom-rows{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
.stress-custom-cell{display:flex;align-items:center;gap:5px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:4px 6px 4px 8px;}
.stress-custom-yr{font-size:11px;color:var(--low);}
.stress-custom-x{border:none;background:none;color:var(--low);cursor:pointer;font-size:15px;line-height:1;padding:0 2px;}
.stress-custom-x:hover{color:var(--red);}
.stress-custom-add{display:flex;align-items:center;gap:3px;border:1px dashed var(--border);background:none;color:var(--mid);border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;font-family:inherit;}
.stress-custom-add:hover{border-color:var(--accent);color:var(--accent);}
.stress-verdict{margin-top:13px;border-top:1px solid var(--border);padding-top:11px;display:flex;flex-direction:column;gap:6px;}
.stress-verdict-row{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;color:var(--mid);}
.stress-verdict-row b{color:var(--ink);font-weight:600;}
.stress-verdict-row.worse b{color:var(--red);}
.stress-foot-actions{display:flex;gap:9px;align-items:center;justify-content:flex-end;width:100%;}
.stress-fixed-label{font-size:13px;color:var(--ink);padding:5px 0;}
.rcfg-mc-row{display:flex;align-items:flex-start;gap:8px;padding:4px 0;}
.rcfg-mc-body{display:flex;flex-direction:column;gap:6px;flex:1;}
.rcfg-mc-label{font-size:13.5px;color:var(--ink);}
.rcfg-mc-controls{display:flex;flex-wrap:wrap;align-items:center;gap:10px;}
.rcfg-mc-status{font-size:11.5px;padding:2px 7px;border-radius:5px;}
.rcfg-mc-status.ok{background:color-mix(in srgb,var(--green) 12%,transparent);color:var(--green);}
.rcfg-mc-status.running{background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);}
.rcfg-mc-status.pending{background:var(--panel);color:var(--mid);}
.rcfg-mc-level-wrap{display:flex;align-items:center;gap:6px;}
.goal-recalc{font-size:10px;font-weight:500;color:var(--accent);opacity:0.8;margin-left:8px;text-transform:none;letter-spacing:0;vertical-align:middle;}
.goal-loading{height:3px;background:var(--track);border-radius:2px;overflow:hidden;margin:20px 0;}
.goal-loading-bar{height:100%;width:40%;background:var(--accent);border-radius:2px;animation:goalSlide 1.2s ease-in-out infinite;}
@keyframes goalSlide{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}
.rep-sub{font-size:12px;color:var(--mid);margin-top:-4px;}
.mc-modal{max-width:680px;width:100%;}
.mc-progress{position:relative;height:24px;border-radius:7px;background:var(--track);overflow:hidden;margin-bottom:14px;display:flex;align-items:center;}
.mc-progress-bar{position:absolute;left:0;top:0;bottom:0;background:color-mix(in srgb, var(--accent) 30%, transparent);transition:width .12s linear;}
.mc-progress span{position:relative;font-size:11.5px;color:var(--mid);padding-left:10px;}
.mc-body.dim{opacity:.5;pointer-events:none;}
.mc-headline{display:flex;align-items:center;gap:16px;margin-bottom:16px;}
.mc-prob{font-size:54px;font-weight:700;line-height:1;letter-spacing:-.02em;}
.mc-prob span{font-size:24px;font-weight:600;margin-left:1px;}
.mc-prob-green{color:var(--green);}
.mc-prob-amber{color:var(--amber);}
.mc-prob-red{color:var(--red);}
.mc-headline-txt{flex:1;}
.mc-headline-main{font-size:15px;color:var(--ink);line-height:1.45;}
.mc-headline-sub{font-size:12.5px;color:var(--mid);line-height:1.5;margin-top:5px;}
.mc-goals{display:flex;flex-direction:column;gap:1px;border:1px solid var(--border);border-radius:11px;overflow:hidden;margin-bottom:16px;background:var(--card);}
.mc-goal{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:9px 13px;border-bottom:1px solid var(--border);}
.mc-goal:last-child{border-bottom:none;}
.mc-goal-q{font-size:12.5px;color:var(--mid);}
.mc-goal-a{font-size:13px;font-weight:650;color:var(--ink);font-variant-numeric:tabular-nums;}
.mc-goal-a.mc-goal-green{color:var(--green);}
.mc-goal-a.mc-goal-amber{color:var(--amber);}
.mc-goal-a.mc-goal-red{color:var(--red);}
.mc-controls{margin-bottom:14px;}
.mc-controls .rec-field{max-width:280px;}
.mc-chart{margin-bottom:14px;}
.mc-chart-title{font-size:12.5px;font-weight:600;color:var(--ink);margin-bottom:8px;}
.mc-chart-title span{font-weight:400;color:var(--mid);}
.mc-fan-key{display:flex;flex-wrap:wrap;gap:14px;margin-top:8px;font-size:11.5px;color:var(--mid);}
.mc-fan-key i{display:inline-block;width:14px;height:10px;border-radius:2px;margin-right:5px;vertical-align:middle;}
.mc-fan-key .mc-key-line{height:3px;border-radius:2px;}
.mc-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;}
.mc-stat{border:1px solid var(--border);border-radius:10px;padding:11px 13px;background:var(--bg);}
.mc-stat-mid{background:var(--panel);border-color:color-mix(in srgb, var(--accent) 30%, var(--border));}
.mc-stat-lbl{font-size:11px;color:var(--low);font-weight:500;}
.mc-stat-val{font-size:18px;font-weight:700;color:var(--ink);margin:3px 0 1px;}
.mc-stat-sub{font-size:11px;color:var(--mid);}
.mc-note{font-size:11.5px;color:var(--mid);line-height:1.55;margin:0;}
.mc-empty{padding:30px 10px;text-align:center;color:var(--mid);font-size:13px;}
@media(max-width:560px){.mc-headline{flex-direction:column;align-items:flex-start;gap:8px;}.mc-stats{grid-template-columns:1fr;}}
.whatif{margin-top:10px;border:1px solid var(--border);background:var(--bg);border-radius:11px;padding:10px 13px 12px;transition:border-color .15s;}
.whatif.active{border-color:var(--accent);}
.whatif-head{display:flex;align-items:center;gap:10px;margin-bottom:8px;}
.whatif-title{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;color:var(--ink);letter-spacing:.02em;}
.wi-hint{font-size:11px;color:var(--low);}
.wi-badge{font-size:10.5px;font-weight:600;color:var(--accent);background:color-mix(in srgb, var(--accent) 12%, transparent);padding:2px 8px;border-radius:20px;}
.wi-reset{margin-left:auto;border:1px solid var(--border);background:var(--card);color:var(--mid);font-family:inherit;font-size:11px;font-weight:600;padding:3px 10px;border-radius:7px;cursor:pointer;}
.wi-reset:hover{color:var(--ink);border-color:var(--border-strong);}
.wi-sliders{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;}
.wi-slider{display:flex;flex-direction:column;gap:5px;}
.wi-srow{display:flex;justify-content:space-between;align-items:baseline;}
.wi-label{font-size:11.5px;color:var(--mid);font-weight:500;}
.wi-val{font-size:12px;font-weight:600;color:var(--low);}
.wi-val.on{color:var(--accent);}
.wi-slider input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:3px;background:var(--border);outline:none;cursor:pointer;}
.wi-slider input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:15px;height:15px;border-radius:50%;background:var(--accent);border:2px solid var(--card);box-shadow:0 1px 3px rgba(0,0,0,.25);cursor:pointer;}
.wi-slider input[type=range]::-moz-range-thumb{width:15px;height:15px;border-radius:50%;background:var(--accent);border:2px solid var(--card);cursor:pointer;}
@media(max-width:560px){.wi-sliders{grid-template-columns:1fr;gap:10px;}}
.infotip-wrap{display:inline;}
.infotip-btn{border:none;background:transparent;color:var(--low);cursor:pointer;padding:0 2px;vertical-align:middle;display:inline-flex;align-items:center;outline:none;}
.infotip-btn:hover,.infotip-btn:focus-visible{color:var(--accent);}
.infotip-inline{display:block;margin-top:5px;font-size:11px;font-weight:400;color:var(--mid);line-height:1.45;background:var(--bg);border:1px solid var(--border);border-radius:7px;padding:7px 9px;text-align:left;}
.modal-scrim{position:fixed;inset:0;background:rgba(15,20,28,.42);display:flex;align-items:center;justify-content:center;padding:20px;z-index:200;backdrop-filter:blur(2px);}
/* Report options modal */
.report-modal{width:min(640px,100%);}
.modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px;}
.rcfg-presets{display:flex;align-items:center;gap:8px;margin:10px 0 12px;}
.rcfg-presets-note{font-size:11.5px;color:var(--low);}
.rcfg-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;border:1px solid var(--border);border-radius:11px;padding:12px 14px;}
.rcfg-row{display:flex;align-items:flex-start;gap:8px;font-size:13px;color:var(--ink);cursor:pointer;}
.rcfg-row input{margin-top:2px;accent-color:#2e9e6b;}
.rcfg-row em{font-style:normal;color:var(--low);font-size:11.5px;}
.rcfg-row.off{opacity:.55;cursor:default;}
.rcfg-row.locked{opacity:.7;cursor:default;}
.rcfg-line{margin-top:10px;}
.rcfg-id{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;}
.rcfg-comm{margin-top:14px;}
.rcfg-comm-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}
.rcfg-comm-area{min-height:150px;font-size:12.5px;}
/* New report elements */
.rep-foot{margin-top:auto;padding-top:14px;font-size:9.5px;color:#9aa3ae;border-top:1px solid #eceff3;text-align:center;}
.report-page{display:flex;flex-direction:column;}
.rep-lede{font-size:14px;}
.rep-small{font-size:10.5px;color:#6b7480;}
.rep-exec-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0;}
.rep-exec-item{border:1px solid #e3e7ec;border-radius:10px;padding:10px 13px;display:flex;flex-direction:column;gap:3px;}
.rep-exec-item span{font-size:10.5px;color:#6b7480;}
.rep-exec-item b{font-size:14px;color:#161b22;}
.rep-snap{display:flex;gap:22px;align-items:flex-start;margin-top:8px;}
.rep-snap-pie{display:flex;flex-direction:column;gap:6px;}
.rep-snap-table{flex:1;}
.modal{background:var(--card);border:1px solid var(--border);border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.28);width:min(560px,100%);max-height:90vh;overflow-y:auto;padding:20px 22px 18px;}
.modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px;}
.modal-title{font-family:'Manrope',serif;font-size:21px;font-weight:600;color:var(--ink);}
.modal-sub{font-size:12.5px;color:var(--mid);margin-top:2px;}
.goal-cards{display:flex;flex-direction:column;gap:10px;}
.goal-card{border:1px solid var(--border);border-left-width:3px;border-radius:10px;padding:12px 14px;background:var(--bg);}
.goal-card-head{display:flex;align-items:flex-start;gap:8px;font-size:12px;font-weight:700;color:var(--ink);margin-bottom:5px;line-height:1.35;}
.goal-card-head svg{flex:none;margin-top:1px;}
.goal-card-text{font-size:13px;line-height:1.5;color:var(--mid);}
.goal-card-note{font-size:11px;line-height:1.5;color:var(--low);margin-top:7px;padding-top:7px;border-top:1px solid var(--border);}
.goal-head{border-left-color:var(--green);}
.goal-need{border-left-color:var(--amber);}
.goal-no{border-left-color:var(--red);}
.goal-info{border-left-color:var(--low);}
.modal-foot{font-size:11.5px;color:var(--low);margin-top:15px;line-height:1.45;border-top:1px solid var(--border);padding-top:12px;}
.ci-block{margin-top:13px;padding:13px 14px;border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:10px;background:var(--bg);}
.ci-block.on{box-shadow:inset 0 0 0 1px var(--accent);}
.ci-head{display:flex;align-items:center;gap:7px;font-weight:600;font-size:13px;color:var(--ink);}
.ci-text{font-size:11.5px;color:var(--mid);line-height:1.45;margin:6px 0 11px;}
.ci-apply{margin-top:11px;width:100%;border:none;background:var(--accent);color:#fff;font-family:inherit;font-weight:600;font-size:12.5px;padding:9px;border-radius:8px;cursor:pointer;}
.ci-apply:hover{filter:brightness(1.05);}
.ci-actions{display:flex;gap:8px;align-items:stretch;}
.ci-clear{margin-top:11px;border:1px solid var(--border);background:var(--card);color:var(--mid);font-family:inherit;font-weight:600;font-size:12.5px;padding:9px 14px;border-radius:8px;cursor:pointer;}
.ci-clear:hover{color:var(--ink);border-color:var(--border-strong);}
.active-overlay{display:flex;align-items:center;justify-content:space-between;gap:10px;background:color-mix(in srgb, var(--red) 9%, transparent);border:1px solid color-mix(in srgb, var(--red) 30%, transparent);border-radius:10px;padding:9px 13px;margin-bottom:15px;font-size:12.5px;color:var(--ink);}
.active-overlay span{display:flex;align-items:center;gap:7px;font-weight:500;}
.active-overlay button{border:none;background:var(--red);color:#fff;font-family:inherit;font-weight:600;font-size:11.5px;padding:5px 12px;border-radius:7px;cursor:pointer;flex:none;}
.report-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);background:var(--card);color:var(--ink);font-family:inherit;font-size:12.5px;font-weight:600;padding:7px 13px;border-radius:9px;cursor:pointer;white-space:nowrap;}
.report-btn:hover{border-color:var(--border-strong);}
.report-overlay{position:fixed;inset:0;z-index:300;background:#f3f4f6;overflow:auto;color:#1a1f28;font-family:"Manrope",ui-sans-serif,system-ui,sans-serif;}
.report-toolbar{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 18px;background:#fff;border-bottom:1px solid #e2e6ec;}
.report-tb-title{display:flex;align-items:center;gap:8px;font-weight:600;font-size:13.5px;}
.report-sheet{max-width:820px;margin:22px auto;background:#fff;border:1px solid #e2e6ec;border-top:3px solid #C8A951;border-radius:6px;padding:46px 52px;box-shadow:0 8px 30px rgba(20,30,50,.06);}
.report-page{padding-bottom:34px;margin-bottom:34px;border-bottom:1px solid #eef1f4;}
.report-page.report-last{border-bottom:none;margin-bottom:0;}
.rep-cover{margin-bottom:26px;}
.rep-cover-brand{display:flex;align-items:center;gap:9px;}
.rep-cover-word{font-weight:700;font-size:19px;letter-spacing:-.02em;color:#102A43;}
.rep-cover-kicker{font-weight:600;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#0CA5A5;padding-left:9px;border-left:1px solid #d9dee5;}
.rep-h1{font-family:"Manrope",Georgia,serif;font-size:34px;font-weight:600;margin:10px 0 6px;letter-spacing:-.01em;}
.rep-meta{font-size:12.5px;color:#7a8493;}
.rep-h2{position:relative;padding-left:13px;font-family:"Manrope",ui-sans-serif,sans-serif;font-size:19px;font-weight:700;margin:0 0 4px;color:#102A43;}
.rep-h2::before{content:"";position:absolute;left:0;top:4px;bottom:4px;width:3px;border-radius:2px;background:#0CA5A5;}
.rep-h3{font-family:"Manrope",Georgia,serif;font-size:15px;font-weight:600;margin:0 0 4px;}
.rep-p{font-size:12.5px;color:#5b6573;margin:0 0 14px;line-height:1.5;}
.rep-verdict{border-radius:11px;padding:16px 18px;margin-bottom:22px;border:1px solid;}
.rep-verdict-tag{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px;}
.rep-verdict-text{font-size:13.5px;line-height:1.5;color:#2a3038;}
.rep-green{background:#eaf7f0;border-color:#bfe6d2;}.rep-green .rep-verdict-tag{color:#1f8a5b;}
.rep-amber{background:#fdf4e3;border-color:#f2dca8;}.rep-amber .rep-verdict-tag{color:#b9831a;}
.rep-red{background:#fbecec;border-color:#f1c4c4;}.rep-red .rep-verdict-tag{color:#c0392b;}
.rep-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px;}
.rep-kpi{border:1px solid #e6e9ee;border-radius:10px;padding:13px 14px;}
.rep-kpi span{display:block;font-size:11px;color:#7a8493;margin-bottom:5px;}
.rep-kpi b{font-size:18px;font-weight:600;letter-spacing:-.01em;}
.rep-people{display:flex;gap:14px;flex-wrap:wrap;}
.rep-person{flex:1;min-width:200px;border-left:3px solid #e6e9ee;padding:2px 0 2px 12px;}
.rep-person b{display:block;font-size:13.5px;}
.rep-person span{font-size:11.5px;color:#7a8493;}
.rep-chart{width:100%;}
.rep-legend{display:flex;flex-wrap:wrap;gap:14px;margin-top:10px;font-size:11.5px;color:#5b6573;}
.rep-legend span{display:inline-flex;align-items:center;gap:6px;}
.rep-legend i{width:11px;height:11px;border-radius:3px;display:inline-block;}
.rep-legend i.rep-dash{width:16px;height:0;border-radius:0;border-top:2px dashed #7a8493;}
.rep-legend i.rep-solid{width:16px;height:0;border-radius:0;border-top:2px solid #161b22;}
.rep-table{width:100%;border-collapse:collapse;font-size:12px;}
.rep-table th{text-align:left;font-weight:600;color:#7a8493;font-size:10.5px;text-transform:uppercase;letter-spacing:.03em;padding:7px 9px;border-bottom:1.5px solid #e6e9ee;}
.rep-table td{padding:8px 9px;border-bottom:1px solid #f0f2f5;color:#2a3038;}
.rep-table th.r,.rep-table td.r{text-align:right;}
.rep-yt tbody tr.yt-ret{background:#f3f8ff;}
.rep-yt tbody tr.yt-ret td{border-bottom-color:#dCe7f5;}
.rep-yt tbody tr.yt-dep{background:#fff5f5;}
.rep-yt tbody tr.yt-dep td{border-bottom-color:#f6dada;}
.rep-yt td:first-child{font-weight:600;}
.rep-pos{color:#1b7a4b;font-weight:600;}
.rep-neg{color:#c62828;font-weight:600;}
.rep-warn{color:#b26a00;font-weight:600;}
.rep-empty{color:#9aa3b0;font-style:italic;}
.rep-notes{margin:0;padding-left:18px;font-size:12.5px;color:#2a3038;line-height:1.7;}
.rep-disc{font-size:11px;color:#7a8493;line-height:1.55;margin:0 0 10px;}
.rep-runhead{display:none;}
@media print {
  body * { visibility: hidden; }
  .report-overlay, .report-overlay * { visibility: visible; }
  .report-overlay { position: absolute; inset: 0; background: #fff; overflow: visible; }
  .report-no-print { display: none !important; }
  .report-sheet { margin: 0; border: none; border-radius: 0; box-shadow: none; padding: 0; max-width: none; }
  .report-page { page-break-after: always; border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
  .report-page.report-last { page-break-after: auto; }
  .rep-table, .rep-kpi, .rep-chart, .rep-verdict { break-inside: avoid; }
  .rep-runhead { display: flex; align-items: center; justify-content: space-between; padding: 0 0 7px; margin: 0 0 16px; border-bottom: 1px solid #e6e9ee; }
  .rep-rh-brand { display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 12px; letter-spacing: -.01em; color: #102A43; }
  .rep-rh-doc { font-size: 10px; color: #7a8493; }
  @page { size: A4; margin: 16mm; }
}
.cash-head{margin-top:12px;border-top:1px solid var(--border);padding-top:11px;}
.cash-title{font-size:13px;font-weight:600;color:var(--ink);display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;}
.cash-title span{font-weight:400;font-size:11px;color:var(--low);}
.chart-cash{height:clamp(140px,20vh,220px);}

.summary-bar{display:flex;gap:10px;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:11px 16px;box-shadow:var(--shadow);}
.summary-bar div{flex:1;display:flex;flex-direction:column;gap:2px;}
.summary-bar div+div{border-left:1px solid var(--border);padding-left:16px;}
.summary-bar span{font-size:11px;color:var(--mid);}
.summary-bar b{font-size:16px;font-weight:600;color:var(--ink);letter-spacing:-0.01em;}

.tip{background:var(--panel);border:1px solid var(--border-strong);border-radius:11px;padding:11px 13px;min-width:230px;max-width:290px;max-height:calc(100vh - 24px);overflow-y:auto;box-shadow:0 12px 36px rgba(15,30,50,.18);}
.tip-head{font-size:12px;color:var(--mid);margin-bottom:8px;}
.tip-head b{color:var(--ink);font-size:13px;} .tip-yr{color:var(--low);margin-left:6px;}
.tip-total{display:flex;justify-content:space-between;font-size:13px;color:var(--mid);}
.tip-total b{color:var(--ink);font-size:14px;}
.tip-rule{height:1px;background:var(--border);margin:8px 0;}
.tip-row{display:flex;justify-content:space-between;gap:18px;font-size:12px;color:var(--mid);padding:2px 0;}
.tip-row .num{color:var(--ink);}
.tip-sub{border-top:1px dashed var(--border);margin-top:3px;padding-top:5px;}
.tip-sub span{color:var(--ink);font-weight:600;}
.tip-net{font-size:11.5px;font-weight:600;margin-top:7px;text-align:right;}
.tip-name{display:flex;align-items:center;gap:7px;} .tip-name i{width:9px;height:9px;border-radius:3px;flex:none;}

@media (max-width:1180px){
  .app{grid-template-columns:64px 348px 1fr;}
  .rail{padding:16px 8px;align-items:center;}
  .rail-item{justify-content:center;padding:11px 0;}
  .rail-label,.soon-pill{display:none;}
}
@media (max-width:920px){
  .app{display:flex;flex-direction:column;}
  .rail{display:none;}
  .tabbar{display:flex;}
  .editor{border-right:none;border-bottom:1px solid var(--border);max-height:360px;}
  .chartwrap{order:-1;}
  .stats{grid-template-columns:repeat(2,1fr);}
}
@media (max-width:560px){
  .stat-value{font-size:19px;}
  .summary-bar{flex-direction:column;gap:8px;}
  .summary-bar div+div{border-left:none;padding-left:0;border-top:1px solid var(--border);padding-top:8px;}
  .topbar-tools .btn-primary span{display:none;}
}
`;
