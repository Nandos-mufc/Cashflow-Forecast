"use client";
import React, { useState, useMemo, useEffect, useRef } from "react";
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
const deathDefault = () => ({ mode: "cease", pct: 50 });

// Tax is OFF by default (international-first). When off, the engine behaves exactly as if this block didn't exist.
const taxDefault = () => ({
  enabled: false,
  cgtRate: 0,
  periods: [{ id: uid(), label: "Tax-free", startMode: "now", startAge: 0, personalAllowance: 0, bands: [] }],
});
// Starting points only — the adviser verifies and edits the current rates. Not a maintained library.
const TAX_PRESETS = {
  none: { personalAllowance: 0, bands: [] },
  uk: { personalAllowance: 12570, bands: [{ upTo: 50270, rate: 20 }, { upTo: 125140, rate: 40 }, { upTo: "", rate: 45 }] },
  blank: { personalAllowance: 0, bands: [{ upTo: "", rate: 0 }] },
};
// Stress scenarios — each returns {yearOffset: growthDeltaPts}. Args: retirement year offset, plan end offset.
const STRESS_SCENARIOS = [
  { id: "crashNow", label: "Market crash now", desc: "A 2008-style fall early in the plan, with a partial bounce the year after.", build: () => ({ 0: -35, 1: 12 }) },
  { id: "crashRet", label: "Crash at retirement", desc: "The dangerous one — markets fall just as drawdown begins (sequence-of-returns risk).", build: (r) => ({ [r]: -35, [r + 1]: 12 }) },
  { id: "lostDecade", label: "Lost decade", desc: "Returns roughly 4 points lower than assumed for ten years.", build: () => { const o = {}; for (let i = 0; i < 10; i++) o[i] = -4; return o; } },
  { id: "lowReturns", label: "Permanently lower returns", desc: "Returns 2 points below assumption for the entire plan.", build: (r, end) => { const o = {}; for (let i = 0; i <= end; i++) o[i] = -2; return o; } },
];
const NOTE_COLORS = ["#8b5cf6", "#0ea5e9", "#f59e0b", "#ec4899", "#14b8a6", "#6366f1"];
const noteColor = (i) => NOTE_COLORS[i % NOTE_COLORS.length];

const SEED = {
  profile: {
    couple: true,
    currency: "GBP",
    client1: { name: "Adam Reyes", dob: "1977-04-12", retirementAge: 60, lifeExpectancy: 93 },
    client2: { name: "Sara Reyes", dob: "1980-09-20", retirementAge: 60, lifeExpectancy: 95 },
  },
  assumptions: { inflation: 2.5, survivorExpenseFactor: 67, tax: taxDefault() },
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
  let tax = 0, lower = pa;
  for (const b of period.bands) {
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
  for (let i = 0; i < 50 && netOf(hi) < need; i++) hi *= 1.6;
  for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (netOf(m) >= need) hi = m; else lo = m; }
  return hi;
}

function projectCashflow({ profile, assumptions, assets, incomes, expenses, liabilities = [], protection = [], lumpSums = [], incomeStop = null, shocks }) {
  const ctx = makeCtx(profile, assumptions);
  const couple = ctx.couple;
  const inflDec = (Number(assumptions.inflation) || 0) / 100;
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

  const surplusDest = () =>
    (assets.find((a) => a.type === "investment") || assets.find((a) => a.type === "cash") || assets[0] || {}).id;

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
    incomes.forEach((i) => {
      let v = flowForYear(i, y, ctx, inflDec) * frac;
      const o = i.owner || "client1";
      if (couple && (o === "client1" || o === "client2") && !ownerAlive(o)) {
        v = i.onDeath && i.onDeath.mode === "continue" ? v * ((Number(i.onDeath.pct) || 0) / 100) : 0;
      }
      // CI claim: the affected person can no longer earn — stop their salary-like income (ends at retirement) from the claim year
      if (incomeStop && o === incomeStop.owner && y >= incomeStop.year && i.end && i.end.mode === "retirement") v = 0;
      incomeBy[i.id] = v;
      income += v;
    });

    // expenditure for this year (pro-rated; death rules + survivor factor on joint)
    let expenditure = 0, expEssential = 0, expDiscretionary = 0, liabRepay = 0, premiums = 0;
    expenses.forEach((e) => {
      let v = flowForYear(e, y, ctx, inflDec) * frac;
      const o = e.owner || "joint";
      if (couple && (o === "client1" || o === "client2") && !ownerAlive(o)) v = 0;
      else if (couple && o === "joint" && firstDeath) v *= survFactor;
      expenditure += v;
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

    // grow balances over the (partial) year — a stress test adds a per-year growth shock (percentage points)
    const shockPts = shocks && shocks[y] != null ? Number(shocks[y]) : 0;
    assets.forEach((a) => (bal[a.id] = bal[a.id] * Math.pow(1 + ((Number(a.growthRate) || 0) + shockPts) / 100, frac)));

    // contributions (pro-rated; stop if owner has died)
    let contribPersonal = 0;
    assets.forEach((a) => {
      const c = a.contribution;
      const aliveOwner = couple ? ownerAlive(a.owner || "client1") : true;
      if (c && c.enabled && aliveOwner) {
        const amt = flowForYear(c, y, ctx, inflDec) * frac;
        if (amt > 0) {
          bal[a.id] += amt;
          if (c.source !== "employer" || a.type !== "pension") contribPersonal += amt;
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

    const net = income - expenditure;
    const freeAfter = net - contribPersonal;

    const drawList = () => {
      const out = [];
      ["cash", "investment", "pension", "property"].forEach((type) => {
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
    const period = taxPeriodFor(c1Age, ctx.tax);
    const cgt = period ? (Number(ctx.tax.cgtRate) || 0) / 100 : 0;
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
    let taxPaid = 0;
    if (freeAfter >= 0) {
      const dest = surplusDest();
      if (dest) bal[dest] += freeAfter;
    } else {
      let need = -freeAfter;
      let taxableYr = 0;
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
    rows.push({ y, year: baseYear + y, c1Age, c2Age, aliveC1, aliveC2, firstDeath, total, property, debt, income, expenditure, expEssential, expDiscretionary, liabRepay, premiums, contrib: contribPersonal, net, status, shortfall, taxPaid, incomeBy, ...pots });

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
const firstName = (n, fb) => { const s = (n || "").trim().split(/\s+/)[0]; return s || fb; };

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
    ink: "hsl(215 32% 17%)", mid: "hsl(215 14% 44%)", low: "hsl(215 12% 62%)",
    accent: "hsl(215 52% 26%)", accentSoft: "hsl(215 60% 96%)",
    netStroke: "hsl(212 68% 46%)", netFill: "hsl(212 72% 54%)", grid: "hsl(214 22% 92%)",
    green: "hsl(150 56% 38%)", amber: "hsl(28 80% 54%)", red: "hsl(352 70% 50%)",
    line: "hsl(215 32% 17%)", track: "hsl(214 22% 88%)",
    shadow: "0 1px 2px hsl(215 30% 20% / 0.04), 0 8px 24px hsl(215 30% 20% / 0.05)",
  },
  dark: {
    bg: "#0A0E16", panel: "#10151F", rail: "#0C111A", card: "#131A24",
    border: "rgba(255,255,255,0.08)", borderStrong: "rgba(255,255,255,0.15)",
    ink: "#F2F6FC", mid: "#97A4B9", low: "#5E6C82",
    accent: "hsl(205 90% 60%)", accentSoft: "rgba(56,189,248,0.12)",
    netStroke: "hsl(205 90% 64%)", netFill: "hsl(205 90% 60%)", grid: "rgba(255,255,255,0.06)",
    green: "hsl(160 60% 45%)", amber: "hsl(28 86% 60%)", red: "hsl(352 80% 64%)",
    line: "#E7EDF5", track: "rgba(255,255,255,0.1)", shadow: "0 10px 30px rgba(0,0,0,0.4)",
  },
};

/* ================================================================== */
/*  FIELD PRIMITIVES                                                  */
/* ================================================================== */
function NumberInput({ value, onCommit, className = "", step = 1, min }) {
  const [txt, setTxt] = useState(value === "" || value == null ? "" : String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) {
      const cur = txt === "" ? null : Number(txt);
      if (cur !== Number(value)) setTxt(value === "" || value == null ? "" : String(value));
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input
      type="number" className={`num ${className}`} value={txt} step={step} min={min}
      onFocus={(e) => { focused.current = true; e.target.select(); }}
      onChange={(e) => { setTxt(e.target.value); onCommit(e.target.value === "" ? 0 : Number(e.target.value)); }}
      onBlur={() => { focused.current = false; setTxt(value === "" || value == null ? "0" : String(value)); }}
    />
  );
}
const Money = ({ value, onChange, symbol }) => (
  <div className="money"><span className="money-sym">{symbol}</span><NumberInput value={value} step={1000} min={0} className="money-in" onCommit={onChange} /></div>
);
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
/* ================================================================== */
function StreamRow({ item, sym, kind, ectx, inflation, couple, ownerOpts, expanded, onToggle, onChange, onRemove }) {
  const per = { weekly: "/wk", monthly: "/mo", annual: "/yr", oneoff: "one-off", everyN: `/${item.everyYears}yr` }[item.frequency];
  const owner = item.owner || (kind === "expense" ? "joint" : "client1");
  const ownerName = (ownerOpts.find((o) => o.value === owner) || {}).label || "";
  return (
    <div className={`rec ${expanded ? "open" : ""}`}>
      <button className="rec-bar" onClick={onToggle}>
        <span className="rec-name-r">{item.name || "Untitled"}</span>
        {couple && <span className="owner-chip">{ownerName}</span>}
        {kind === "expense" && <span className={`prio ${item.priority}`}>{item.priority === "essential" ? "Ess" : "Disc"}</span>}
        <span className="rec-sum num">{sym}{(Number(item.amount) || 0).toLocaleString()} <em>{per}</em></span>
        <ChevronDown size={15} className="chev" />
      </button>
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
export default function RunwayApp({ initialData = null, onChange = null }) {
  const seed = initialData || SEED;
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
  const [stress, setStress] = useState(null);
  const [ci, setCi] = useState(null);
  const [ciDraft, setCiDraft] = useState({ owner: "client1", age: 65, amount: 250000 });
  const [annotations, setAnnotations] = useState(seed.annotations || []);

  const [profile, setProfile] = useState(seed.profile);
  const [assumptions, setAssumptions] = useState(seed.assumptions);
  const [assets, setAssets] = useState(seed.assets);
  const [incomes, setIncomes] = useState(seed.incomes);
  const [expenses, setExpenses] = useState(seed.expenses);
  const [liabilities, setLiabilities] = useState(seed.liabilities || []);
  const [protection, setProtection] = useState(seed.protection || []);
  const [adviserNotes, setAdviserNotes] = useState(seed.adviserNotes || "");

  // Report the full plan upward so the host can persist it (autosave).
  useEffect(() => {
    if (!onChange) return;
    onChange({ profile, assumptions, assets, incomes, expenses, liabilities, protection, annotations, adviserNotes });
  }, [profile, assumptions, assets, incomes, expenses, liabilities, protection, annotations, adviserNotes]); // eslint-disable-line react-hooks/exhaustive-deps

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
    link.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Hanken+Grotesk:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
    return () => { try { document.head.removeChild(link); } catch (e) {} };
  }, []);

  const rows = useMemo(
    () => projectCashflow({ profile: effProfile, assumptions: effAssumptions, assets: effAssets, incomes, expenses, liabilities, protection }),
    [effProfile, effAssumptions, effAssets, incomes, expenses, liabilities, protection]
  );
  const stressShocks = useMemo(() => {
    if (!stress) return null;
    const sc = STRESS_SCENARIOS.find((s) => s.id === stress);
    return sc ? sc.build(Math.max(0, ectx.retC1 - ectx.age0c1), ectx.planEndYear) : null;
  }, [stress, ectx]);
  const ciClaimYear = useMemo(() => {
    if (!ci) return null;
    const age0 = ci.owner === "client2" ? ectx.age0c2 : ectx.age0c1;
    return Math.max(0, Math.round((Number(ci.age) || age0) - age0));
  }, [ci, ectx]);
  const stressRows = useMemo(() => {
    const baseArgs = { profile: effProfile, assumptions: effAssumptions, assets: effAssets, incomes, expenses, liabilities, protection };
    if (ci) return projectCashflow({ ...baseArgs, lumpSums: [{ year: ciClaimYear, amount: Number(ci.amount) || 0 }], incomeStop: { owner: ci.owner, year: ciClaimYear } });
    if (stressShocks) return projectCashflow({ ...baseArgs, shocks: stressShocks });
    return null;
  }, [ci, ciClaimYear, stressShocks, effProfile, effAssumptions, effAssets, incomes, expenses, liabilities, protection]);
  const colors = useMemo(() => buildColors(assets), [assets]);
  const incColors = useMemo(() => buildIncomeColors(incomes), [incomes]);
  const stackOrder = useMemo(() => [...assets].sort((a, b) => STACK_RANK[a.type] - STACK_RANK[b.type]), [assets]);
  const tooltipOrder = useMemo(() => [...assets].sort((a, b) => TOOLTIP_RANK[a.type] - TOOLTIP_RANK[b.type]), [assets]);
  const legendTypes = useMemo(() => { const s = []; tooltipOrder.forEach((a) => { if (!s.includes(a.type)) s.push(a.type); }); return s; }, [tooltipOrder]);
  const hasProperty = useMemo(() => assets.some((a) => a.type === "property"), [assets]);

  const inflDec = (Number(effAssumptions.inflation) || 0) / 100;
  const data = useMemo(() => rows.map((r, idx) => {
    const f = showReal ? Math.pow(1 + inflDec, r.y) : 1;
    const dz = (v) => v / f;
    const sr = stressRows && stressRows[idx] ? stressRows[idx] : null;
    const flow = sr || r; // money-in-vs-out reflects the active scenario (e.g. CI salary drop, crash depletion)
    const o = { year: r.year, y: r.y, c1Age: r.c1Age, c2Age: r.c2Age, aliveC1: r.aliveC1, aliveC2: r.aliveC2, total: dz(r.total), property: dz(r.property), investable: dz(r.total - r.property), debt: dz(r.debt || 0), netWorth: dz(r.total - (r.debt || 0)), income: dz(flow.income), expenditure: dz(flow.expenditure), taxPaid: dz(flow.taxPaid || 0), contrib: dz(flow.contrib || 0), outgoings: dz(flow.expenditure + (flow.contrib || 0)), expEssential: dz(flow.expEssential || 0), expDiscretionary: dz(flow.expDiscretionary || 0), premiums: dz(flow.premiums || 0), liabRepay: dz(flow.liabRepay || 0) };
    if (sr) o.stressed = dz(sr.total - (sr.debt || 0));
    assets.forEach((a) => (o[aKey(a.id)] = dz(r[aKey(a.id)] || 0)));
    incomes.forEach((i) => (o[iKey(i.id)] = dz(flow.incomeBy[i.id] || 0)));
    const gap = Math.max(0, (flow.expenditure + (flow.contrib || 0)) - flow.income);
    o.coveredBySavings = dz(Math.max(0, gap - flow.shortfall));
    o.uncovered = dz(flow.shortfall);
    return o;
  }), [rows, showReal, inflDec, assets, incomes, stressRows]);

  const stressImpact = useMemo(() => {
    if (!stressRows) return null;
    const sc = STRESS_SCENARIOS.find((s) => s.id === stress);
    const ageOf = (dr) => (dr ? (dr.aliveC1 ? dr.c1Age : dr.c2Age) : null);
    const label = ci ? `Critical illness claim · ${ci.owner === "client2" ? fn2 : fn1} age ${ci.age}` : sc ? sc.label : "";
    return { label, baseAge: ageOf(rows.find((r) => r.shortfall > 0)), stressAge: ageOf(stressRows.find((r) => r.shortfall > 0)) };
  }, [stressRows, rows, stress, ci, fn1, fn2]);

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
    return { currentTotal, peak, atRetirement, endVal, endYear, depletionAge, depYear, depName, depRet, tone };
  }, [rows, data, assets, liabilities, ectx, baseYear, couple, fn1, fn2]);

  const banner = useMemo(() => {
    if (kpis.depletionAge === null) return { tone: "green", Icon: CheckCircle2, text: "Plan is fully funded — investable assets last to the end of the plan." };
    const into = kpis.depletionAge - kpis.depRet;
    const tail = into > 0 ? `${into} year${into === 1 ? "" : "s"} into retirement` : "before the planned retirement age";
    const who = kpis.depName ? `${kpis.depName} aged ${kpis.depletionAge}` : `age ${kpis.depletionAge}`;
    const propNote = hasProperty ? " — held property is excluded as it isn't being spent" : "";
    return { tone: kpis.tone, Icon: kpis.tone === "red" ? XCircle : AlertTriangle, text: `Spendable assets run short in ${kpis.depYear}, around ${who} (${tail})${propNote}.` };
  }, [kpis, hasProperty]);

  const eventList = useMemo(() => {
    const ev = [];
    if (markers.retC1) ev.push({ label: couple ? `${fn1} retires` : "Retirement", year: markers.retC1, color: t.ink });
    if (markers.retC2) ev.push({ label: `${fn2} retires`, year: markers.retC2, color: t.ink });
    if (markers.firstDeath) ev.push({ label: "First death", year: markers.firstDeath, color: t.mid });
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
  const REPORT_CFG_KEY = "runway_report_cfg";
  const defaultReportCfg = () => ({
    sections: { exec: true, snapshot: true, charts: true, cashgap: true, stress: true, protection: true, whatif: false, inputs: true, assumptions: true, commentary: true },
    anonymous: false, adviser: "", firm: "",
  });
  const [reportCfg, setReportCfg] = useState(() => {
    if (typeof window === "undefined") return defaultReportCfg();
    try { const saved = JSON.parse(localStorage.getItem(REPORT_CFG_KEY) || "null"); return saved ? { ...defaultReportCfg(), ...saved, sections: { ...defaultReportCfg().sections, ...(saved.sections || {}) } } : defaultReportCfg(); } catch { return defaultReportCfg(); }
  });
  const [reportStage, setReportStage] = useState("options"); // "options" | "view"
  const [commentaryEdit, setCommentaryEdit] = useState(null); // null = follow generated
  const [copiedSummary, setCopiedSummary] = useState(false);
  const upReportCfg = (patch) => setReportCfg((c) => { const n = { ...c, ...patch, sections: { ...c.sections, ...(patch.sections || {}) } }; try { localStorage.setItem(REPORT_CFG_KEY, JSON.stringify(n)); } catch {} return n; });
  const stressActive = !!stressImpact;

  // Cash gap analysis — base plan (ignores any active stress overlay), in the report's money basis.
  // Three states: no draw at all · one-off years only · sustained drawdown.
  const cashGap = useMemo(() => {
    if (!reportOpen) return null;
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
  }, [reportOpen, rows, showReal, inflDec]);

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

  // ---- Protection gap analysis ----------------------------------------------------------------
  // Two layers: (1) rule-of-thumb benchmarks (house multipliers × current income), and
  // (2) the engine-driven survivor test — simulate death at a chosen age and solve for the
  // additional lump sum at death that keeps the survivor's plan funded. Observational output only.
  const PROT_MULT_KEY = "runway_prot_mult";
  const [protMult, setProtMult] = useState(() => {
    if (typeof window === "undefined") return { life: 10, ci: 3 };
    try { return { life: 10, ci: 3, ...(JSON.parse(localStorage.getItem(PROT_MULT_KEY) || "{}") || {}) }; } catch { return { life: 10, ci: 3 }; }
  });
  const upProtMult = (patch) => setProtMult((m0) => { const n = { ...m0, ...patch }; try { localStorage.setItem(PROT_MULT_KEY, JSON.stringify(n)); } catch {} return n; });
  const [deathAges, setDeathAges] = useState({ client1: null, client2: null }); // null = default (current age + 1)
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
    const inForce = (k, ty) => protection.filter((p) => (p.insured || "client1") === k && (p.ptype || "life") === ty && (Number(p.coverToAge) || 0) >= (k === "client2" ? ectx.age0c2 : ectx.age0c1)).reduce((s, p) => s + (Number(p.sumAssured) || 0), 0);
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
      const baseArgs = { profile, assumptions, assets, incomes, expenses, liabilities, protection };
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
        return { k, dAge, minAge, maxAge, funded, firstShortYear, totalShortReal, payout, closeGap };
      });
    }
    return { bench, survivor, annualNow };
  }, [section, reportOpen, incomes, protection, couple, profile, assumptions, assets, expenses, liabilities, ectx, inflDec, protMult, deathAges]);

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
    if (cashGap && !cashGap.none && !cashGap.oneOffOnly) {
      paras.push(`Income currently ${surplus0 >= 0 ? `exceeds spending by about ${m(surplus0)} a year` : `falls short of spending by about ${m(-surplus0)} a year`}. From ${cashGap.firstYear}, spending begins to exceed income on a sustained basis and roughly ${m(cashGap.avgDraw)} a year is drawn from savings and investments, peaking at ${m(cashGap.peakDraw)} in ${cashGap.peakYear}.`);
    } else if (cashGap && cashGap.oneOffOnly) {
      paras.push(`Income covers regular spending in every year of the plan. Savings are drawn on only for one-off costs (${cashGap.isolatedYears.join(", ")}), the largest being ${m(cashGap.peakDraw)} in ${cashGap.peakYear}.`);
    } else if (cashGap && cashGap.none) {
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
    if (cashGap && !cashGap.none && cashGap.uncoveredCount > 0) watch.push(`${cashGap.uncoveredCount} year${cashGap.uncoveredCount === 1 ? "" : "s"} show spending that cannot be met from income or savings, starting ${cashGap.firstUncoveredYear}`);
    const incOwners = new Set(incomes.filter((i) => (Number(i.amount) || 0) > 0).map((i) => i.owner || "client1"));
    if (couple && incOwners.size === 1 && incomes.length > 0) watch.push(`all recorded income belongs to ${incOwners.has("client2") ? n2 : n1}`);
    if (watch.length) paras.push("Watch points: " + watch.join("; ") + ".");
    paras.push(`All figures are ${showReal ? "in today's money (adjusted for inflation)" : "in future money (not adjusted for inflation)"} and reflect the assumptions listed in this report.${stressActive ? " They describe the base plan; the active stress scenario is reported separately." : ""} This commentary describes the projection — it is not a recommendation.`);
    return paras.join("\n\n");
  }, [reportOpen, reportCfg.anonymous, rows, kpis, cashGap, protSnap, protGap, protMult, assets, incomes, liabilities, protection, hasContrib, couple, fn1, fn2, cur, showReal, stressActive]);
  const commentaryText = commentaryEdit ?? generatedCommentary;

  const goal = useMemo(() => {
    if (!goalOpen && !reportOpen) return null;
    const funded = (inp) => !projectCashflow(inp).some((r) => r.shortfall > 0);
    const base = { profile, assumptions, assets, incomes, expenses, liabilities, protection };
    const fundedNow = funded(base);
    const liquidAssets = assets.filter((a) => a.type !== "property").reduce((s, a) => s + (Number(a.value) || 0), 0);
    const curSpend = expenses.reduce((s, e) => { const a = Number(e.amount) || 0; if (e.frequency === "monthly") return s + a * 12; if (e.frequency === "annual") return s + a; return s; }, 0); // recurring annual spend (excludes one-offs)

    // Growth: percentage points added to every asset's assumed return (monotonic — more is better)
    const gTest = (g) => funded({ ...base, assets: assets.map((a) => ({ ...a, growthRate: (Number(a.growthRate) || 0) + g })) });
    let growth = null, growthCapped = false;
    if (fundedNow) {
      if (gTest(-12)) { growth = -12; growthCapped = true; }
      else { let a = -12, b = 0; for (let i = 0; i < 28; i++) { const m = (a + b) / 2; if (gTest(m)) b = m; else a = m; } growth = b; }
    } else if (gTest(25)) { let a = 0, b = 25; for (let i = 0; i < 28; i++) { const m = (a + b) / 2; if (gTest(m)) b = m; else a = m; } growth = b; }

    // Retirement: years shifted for both working clients (monotonic — later is better)
    const rTest = (d) => funded({ ...base, profile: { ...profile, client1: { ...profile.client1, retirementAge: (Number(profile.client1.retirementAge) || 0) + d }, client2: { ...profile.client2, retirementAge: (Number(profile.client2.retirementAge) || 0) + d } } });
    let retire = null;
    if (fundedNow) { let d = 0; while (d > -25 && rTest(d - 1)) d--; retire = d; }
    else { let d = 1; while (d <= 25 && !rTest(d)) d++; retire = d <= 25 ? d : null; }
    const earliestRetAge = retire != null ? (Number(profile.client1.retirementAge) || 0) + retire : null;

    // Spending: multiplier on every expense (monotonic — more is worse)
    const sTest = (f) => funded({ ...base, expenses: expenses.map((e) => ({ ...e, amount: (Number(e.amount) || 0) * f })) });
    let spend = null;
    if (fundedNow) {
      if (sTest(5)) spend = 5;
      else { let a = 1, b = 5; for (let i = 0; i < 26; i++) { const m = (a + b) / 2; if (sTest(m)) a = m; else b = m; } spend = a; }
    } else if (sTest(0.1)) { let a = 0.1, b = 1; for (let i = 0; i < 26; i++) { const m = (a + b) / 2; if (sTest(m)) a = m; else b = m; } spend = a; }
    const maxSpend = spend != null && curSpend > 0 ? curSpend * spend : null;

    // Max one-off purchase today, still funded for life (monotonic — bigger is worse)
    const tmpExp = (extra) => ({ ...base, expenses: [...expenses, extra] });
    const oTest = (amt) => funded(tmpExp({ id: "tmp_o", name: "one-off", amount: amt, frequency: "oneoff", escalation: "none", customEsc: 0, everyYears: 1, start: { mode: "now" }, end: { mode: "end" }, priority: "discretionary", owner: "joint" }));
    let maxOneOff = null;
    if (fundedNow) { let a = 0, b = 5000000; if (oTest(b)) maxOneOff = b; else { for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (oTest(m)) a = m; else b = m; } maxOneOff = a; } }

    // Max extra ongoing commitment (e.g. a new premium or rent), £/month, still funded (monotonic — bigger is worse)
    const mTest = (mo) => funded(tmpExp({ id: "tmp_m", name: "monthly", amount: mo, frequency: "monthly", escalation: "inflation", customEsc: 0, everyYears: 1, start: { mode: "now" }, end: { mode: "end" }, priority: "discretionary", owner: "joint" }));
    let maxMonthly = null;
    if (fundedNow) { let a = 0, b = 50000; if (mTest(b)) maxMonthly = b; else { for (let i = 0; i < 28; i++) { const m = (a + b) / 2; if (mTest(m)) a = m; else b = m; } maxMonthly = a; } }

    // Resilience: would the plan still hold if they lived to 100?
    const to100 = funded({ ...base, profile: { ...profile, client1: { ...profile.client1, lifeExpectancy: Math.max(100, Number(profile.client1.lifeExpectancy) || 0) }, client2: { ...profile.client2, lifeExpectancy: Math.max(100, Number(profile.client2.lifeExpectancy) || 0) } } });

    return { fundedNow, growth, growthCapped, retire, earliestRetAge, spend, maxSpend, curSpend, maxOneOff, maxMonthly, to100, estateEnd: kpis.endVal, estateEndYear: kpis.endYear, liquidAssets };
  }, [goalOpen, reportOpen, profile, assumptions, assets, incomes, expenses, liabilities, protection, rows, kpis]);

  const patch = (setter) => (id, p) => setter((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const rmFn = (setter) => (id) => { setter((prev) => prev.filter((x) => x.id !== id)); setOpen((s) => { const n = new Set(s); n.delete(id); return n; }); };
  const upAsset = patch(setAssets), rmAsset = rmFn(setAssets);
  const upInc = patch(setIncomes), rmInc = rmFn(setIncomes);
  const upExp = patch(setExpenses), rmExp = rmFn(setExpenses);
  const upLiab = patch(setLiabilities), rmLiab = rmFn(setLiabilities);
  const addLiab = () => addOpen(setLiabilities, { id: uid(), name: "New liability", type: "mortgage", balance: 0, rate: 4, monthlyPayment: 0, owner: couple ? "joint" : "client1" });
  const upPol = patch(setProtection), rmPol = rmFn(setProtection);
  const addPol = () => addOpen(setProtection, { id: uid(), name: "New policy", insured: "client1", sumAssured: 250000, premium: 50, coverToAge: 90 });
  const upContrib = (id, p) => setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, contribution: { ...a.contribution, ...p } } : a)));
  const upClient = (which, p) => setProfile((prev) => ({ ...prev, [which]: { ...prev[which], ...p } }));
  const addAnnotation = () => setAnnotations((a) => [...a, { id: uid(), year: baseYear + 5, text: "" }]);
  const upAnnotation = (id, p) => setAnnotations((a) => a.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const rmAnnotation = (id) => setAnnotations((a) => a.filter((x) => x.id !== id));

  const tax = assumptions.tax || taxDefault();
  const setTax = (p) => setAssumptions((a) => ({ ...a, tax: { ...(a.tax || taxDefault()), ...p } }));
  const upPeriod = (id, p) => setTax({ periods: tax.periods.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  const addPeriod = () => setTax({ periods: [...tax.periods, { id: uid(), label: "New jurisdiction", startMode: "age", startAge: Math.max(ectx.age0c1 + 1, 65), personalAllowance: 0, bands: [{ upTo: "", rate: 0 }] }] });
  const rmPeriod = (id) => setTax({ periods: tax.periods.filter((x) => x.id !== id) });
  const applyPreset = (id, key) => upPeriod(id, { personalAllowance: TAX_PRESETS[key].personalAllowance, bands: TAX_PRESETS[key].bands.map((b) => ({ ...b })) });
  const upBand = (pid, idx, patch) => { const p = tax.periods.find((x) => x.id === pid); upPeriod(pid, { bands: p.bands.map((b, i) => (i === idx ? { ...b, ...patch } : b)) }); };
  const addBand = (pid) => { const p = tax.periods.find((x) => x.id === pid); upPeriod(pid, { bands: [...p.bands, { upTo: "", rate: 0 }] }); };
  const rmBand = (pid, idx) => { const p = tax.periods.find((x) => x.id === pid); upPeriod(pid, { bands: p.bands.filter((_, i) => i !== idx) }); };
  const toggleOpen = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const expandAll = (items) => setOpen((s) => { const n = new Set(s); items.forEach((x) => n.add(x.id)); return n; });
  const collapseAll = (items) => setOpen((s) => { const n = new Set(s); items.forEach((x) => n.delete(x.id)); return n; });

  // ---- Risk profiles (per client) -------------------------------------------------------------
  // Selecting a profile applies its per-type growth rates to the assets that person owns.
  // Template rates are firm-configurable: overrides persist in localStorage (device-level house
  // assumptions), merged over the shipped defaults. Apply + drift both use the effective rates.
  const RISK_RATES_KEY = "runway_risk_rates";
  const [riskRateOverrides, setRiskRateOverrides] = useState(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem(RISK_RATES_KEY) || "{}") || {}; } catch { return {}; }
  });
  const [riskEditOpen, setRiskEditOpen] = useState(false);
  const getRiskRates = (id) => { const p = riskProfileById(id); return p ? { ...p.rates, ...(riskRateOverrides[id] || {}) } : null; };
  const setRiskRate = (id, type, v) => setRiskRateOverrides((o) => { const n = { ...o, [id]: { ...(o[id] || {}), [type]: Number(v) } }; try { localStorage.setItem(RISK_RATES_KEY, JSON.stringify(n)); } catch {} return n; });
  const resetRiskRates = () => { setRiskRateOverrides({}); try { localStorage.removeItem(RISK_RATES_KEY); } catch {} };
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
  const addOpen = (setter, rec) => { setter((p) => [...p, rec]); setOpen((s) => new Set(s).add(rec.id)); };
  const addAsset = () => addOpen(setAssets, { id: uid(), name: "New asset", type: "investment", value: 0, growthRate: 5, drawdown: true, owner: couple ? "joint" : "client1", contribution: contribDefault() });
  const addInc = () => addOpen(setIncomes, { id: uid(), name: "New income", amount: 0, frequency: "annual", escalation: "none", customEsc: 0, everyYears: 1, start: { mode: "now" }, end: { mode: "end" }, owner: "client1", onDeath: deathDefault() });
  const addExp = () => addOpen(setExpenses, { id: uid(), name: "New expense", amount: 0, frequency: "annual", escalation: "inflation", customEsc: 0, everyYears: 1, start: { mode: "now" }, end: { mode: "end" }, priority: "essential", owner: "joint" });

  const chartMargin = { top: 8, right: 14, left: 2, bottom: 0 };
  const axisWidth = 54;
  const tick = { fill: t.low, fontSize: 11, fontFamily: "Hanken Grotesk, sans-serif" };
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
    return (
      <div className="tip">
        <div className="tip-head"><b className="num">{d.year}</b> <span className="tip-yr">{agesLabel(d)}</span></div>
        <div className="tip-total"><span>Net worth</span><b className="num">{fmtFull(d.total, cur)}</b></div>
        <div className="tip-rule" />
        {tooltipOrder.map((a) => <div className="tip-row" key={a.id}><span className="tip-name"><i style={{ background: colors[a.id] }} /> {a.name}</span><span className="num">{fmtFull(d[aKey(a.id)] || 0, cur)}</span></div>)}
        {hasProperty && <div className="tip-row tip-sub"><span>Spendable (excl. property)</span><span className="num">{fmtFull(d.investable, cur)}</span></div>}
        {d.debt > 0 && <div className="tip-row"><span className="tip-name">Less: debts</span><span className="num">−{fmtFull(d.debt, cur)}</span></div>}
        {d.debt > 0 && <div className="tip-total"><span>Net worth after debts</span><b className="num">{fmtFull(d.netWorth, cur)}</b></div>}
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
    "--ink": t.ink, "--mid": t.mid, "--low": t.low, "--accent": t.accent, "--accent-soft": t.accentSoft,
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
  ];
  const NAV_SOON = [{ id: "scenarios", label: "Scenarios", Icon: Layers }, { id: "report", label: "Report", Icon: FileText }];

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
          <div className="brand-mark"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 20 L9 12 L13 15 L21 4" fill="none" stroke={t.netStroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /><circle cx="21" cy="4" r="2.3" fill={t.netStroke} /></svg></div>
          <div className="brand-text"><span className="brand-name">Runway</span><span className="brand-tag">{couple ? `${fn1} & ${fn2}` : "International cashflow forecasting"}</span></div>
        </div>
        <div className="topbar-tools">
          {!present && (<>
            <select className="cur-sel num" value={cur} onChange={(e) => setProfile((p) => ({ ...p, currency: e.target.value }))}>{Object.values(CURRENCIES).map((c) => <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}</select>
            <button className="icon-btn" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? <Moon size={16} /> : <Sun size={16} />}</button>
            <button className="report-btn" onClick={() => { setReportStage("options"); setReportOpen(true); }}><FileText size={15} /><span>Report</span></button>
          </>)}
          <button className="btn-primary" onClick={() => setPresent(!present)}>{present ? <Minimize2 size={15} /> : <Maximize2 size={15} />}<span>{present ? "Exit client view" : "Client view"}</span></button>
        </div>
      </header>

      <div className={`app ${present ? "present" : ""}`}>
        {!present && (
          <nav className="rail">
            <div className="rail-group">{NAV.map((n) => <button key={n.id} className={`rail-item ${section === n.id ? "active" : ""}`} onClick={() => setSection(n.id)}><n.Icon size={17} /><span className="rail-label">{n.label}</span></button>)}</div>
            <div className="rail-divider" />
            <div className="rail-group">{NAV_SOON.map((n) => <button key={n.id} className="rail-item soon" disabled><n.Icon size={17} /><span className="rail-label">{n.label}</span><span className="soon-pill">Soon</span></button>)}</div>
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
                      <span className="field-note">Your house assumptions — saved on this device and used whenever a profile is applied. Changing a rate here doesn't alter existing plans until a profile is re-applied.</span>
                    </div>
                  )}
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
                    <div className="field"><label>CGT on investment withdrawals <InfoTip text="A simplified effective rate applied to money drawn from investment pots (not cash, pensions or offshore bonds). Set 0 for ISAs or non-resident clients with no CGT. It's an approximation you control, not a full gain calculation." /></label><Mini value={tax.cgtRate} suffix="%" onChange={(v) => setTax({ cgtRate: v })} /></div>
                    <div className="tax-tl-head">Residence timeline <InfoTip text={`Periods run in age order, anchored to ${couple ? fn1 + "'s" : "the client's"} age. The first starts now; add one to model a move — e.g. tax-free until 60, then UK rates from 60. Tax only affects years where money is withdrawn from pensions or investment pots, so accumulation years won't change.`} /></div>
                    {tax.periods.map((p, idx) => (
                      <div className="tax-period" key={p.id}>
                        <div className="tax-period-top">
                          <input className="tax-label-in" value={p.label} onChange={(e) => upPeriod(p.id, { label: e.target.value })} placeholder="Jurisdiction" />
                          {idx === 0
                            ? <span className="tax-from">from now</span>
                            : <span className="tax-from">from {couple ? `${fn1}'s age` : "age"} <NumberInput className="tax-age" value={p.startAge} onCommit={(v) => upPeriod(p.id, { startAge: v })} /> <em className="tax-yr">≈ {baseYear + Math.max(0, Math.round((Number(p.startAge) || 0) - ectx.age0c1))}</em></span>}
                          {tax.periods.length > 1 && <button className="rec-del" onClick={() => rmPeriod(p.id)}><Trash2 size={14} /></button>}
                        </div>
                        <div className="tax-presets"><span>Preset:</span><button onClick={() => applyPreset(p.id, "none")}>No tax</button><button onClick={() => applyPreset(p.id, "uk")}>UK 2025/26</button><button onClick={() => applyPreset(p.id, "blank")}>Blank</button></div>
                        <div className="rec-field"><label>Tax-free allowance</label><div className="money"><span className="money-sym">{sym}</span><NumberInput className="money-in" value={p.personalAllowance} step={500} onCommit={(v) => upPeriod(p.id, { personalAllowance: v })} /></div></div>
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
                    <p className="ed-hint">Income you enter is treated as net (take-home), so it isn't taxed again. Tax here applies to pension-pot withdrawals, investment drawdown (CGT), and offshore-bond gains above the 5% allowance.</p>
                  </>
                )}
              </div>
            )}
            {section === "assets" && (
              <div className="ed-body">
                <div className="ed-head"><h2 className="ed-title">Assets &amp; investments</h2><div className="ed-head-tools"><ExpandCtl items={assets} open={open} onExpand={expandAll} onCollapse={collapseAll} /><button className="add-btn" onClick={addAsset}><Plus size={15} /> Add</button></div></div>
                {assets.map((a) => {
                  const expanded = open.has(a.id);
                  const realRet = ((Number(a.growthRate) || 0) - (Number(assumptions.inflation) || 0)).toFixed(1);
                  const ownerName = (ownerOpts.find((o) => o.value === (a.owner || "client1")) || {}).label || "";
                  return (
                    <div className={`rec ${expanded ? "open" : ""}`} key={a.id}>
                      <button className="rec-bar" onClick={() => toggleOpen(a.id)}>
                        <span className="swatch" style={{ background: colors[a.id] }} />
                        <span className="rec-name-r">{a.name || "Untitled"}</span>
                        {couple && <span className="owner-chip">{ownerName}</span>}
                        <span className="rec-sum num">{sym}{(Number(a.value) || 0).toLocaleString()}</span>
                        <ChevronDown size={15} className="chev" />
                      </button>
                      {expanded && (
                        <div className="rec-body">
                          <label className="flbl">Name</label>
                          <input className="rec-name" value={a.name} onChange={(e) => upAsset(a.id, { name: e.target.value })} placeholder="Name" />
                          {couple && <div className="rec-field"><label>Belongs to</label><Pick value={a.owner || "client1"} onChange={(v) => upAsset(a.id, { owner: v })} options={ownerOpts} /></div>}
                          <div className="rec-grid">
                            <div className="rec-field"><label>Type</label><Pick value={a.type} onChange={(v) => upAsset(a.id, { type: v })} options={ASSET_TYPES} /></div>
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
                              {a.type === "pension" && <div className="rec-field"><label>Source <InfoTip text="Personal contributions are paid from cashflow, so they reduce the surplus available each year. Employer contributions are added straight to the pot and don't affect the client's cashflow." /></label><Seg value={a.contribution.source} onChange={(v) => upContrib(a.id, { source: v })} options={[{ value: "personal", label: "Personal" }, { value: "employer", label: "Employer" }]} /><span className="inl-note">{a.contribution.source === "employer" ? "added to pot, doesn't reduce cashflow" : "funded from surplus"}</span></div>}
                            </>)}
                          </div>
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
                <div className="ed-head"><h2 className="ed-title">Income</h2><div className="ed-head-tools"><ExpandCtl items={incomes} open={open} onExpand={expandAll} onCollapse={collapseAll} /><button className="add-btn" onClick={addInc}><Plus size={15} /> Add</button></div></div>
                {incomes.map((i) => <StreamRow key={i.id} item={i} sym={sym} kind="income" ectx={ectx} inflation={assumptions.inflation} couple={couple} ownerOpts={ownerOpts} expanded={open.has(i.id)} onToggle={() => toggleOpen(i.id)} onChange={(p) => upInc(i.id, p)} onRemove={() => rmInc(i.id)} />)}
                <p className="ed-hint">End salary at "Retirement" and it tracks each person's retirement age. {couple ? "Set what happens to each income on that person's death." : ""}</p>
              </div>
            )}
            {section === "expenditure" && (
              <div className="ed-body">
                <div className="ed-head"><h2 className="ed-title">Expenditure</h2><div className="ed-head-tools"><ExpandCtl items={expenses} open={open} onExpand={expandAll} onCollapse={collapseAll} /><button className="add-btn" onClick={addExp}><Plus size={15} /> Add</button></div></div>
                {expenses.map((e) => <StreamRow key={e.id} item={e} sym={sym} kind="expense" ectx={ectx} inflation={assumptions.inflation} couple={couple} ownerOpts={ownerOpts} expanded={open.has(e.id)} onToggle={() => toggleOpen(e.id)} onChange={(p) => upExp(e.id, p)} onRemove={() => rmExp(e.id)} />)}
                <p className="ed-hint">One-off and "every N years" cover ad-hoc costs. {couple ? "Joint costs step down to the survivor rate after a death; personal costs cease." : ""}</p>
              </div>
            )}
            {section === "liabilities" && (
              <div className="ed-body">
                <div className="ed-head"><h2 className="ed-title">Liabilities</h2><div className="ed-head-tools"><ExpandCtl items={liabilities} open={open} onExpand={expandAll} onCollapse={collapseAll} /><button className="add-btn" onClick={addLiab}><Plus size={15} /> Add</button></div></div>
                {liabilities.length === 0 && <p className="empty-note">No debts yet. Add a mortgage, BTL loan, or other borrowing — it reduces net worth and its repayments count as spending.</p>}
                {liabilities.map((L) => {
                  const expanded = open.has(L.id);
                  const ownerName = (ownerOpts.find((o) => o.value === (L.owner || "client1")) || {}).label || "";
                  return (
                    <div className={`rec ${expanded ? "open" : ""}`} key={L.id}>
                      <button className="rec-bar" onClick={() => toggleOpen(L.id)}>
                        <span className="swatch" style={{ background: t.red }} />
                        <span className="rec-name-r">{L.name || "Untitled"}</span>
                        {couple && <span className="owner-chip">{ownerName}</span>}
                        <span className="rec-sum num">−{sym}{(Number(L.balance) || 0).toLocaleString()}</span>
                        <ChevronDown size={15} className="chev" />
                      </button>
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
                <div className="ed-head"><h2 className="ed-title">Protection</h2><div className="ed-head-tools"><ExpandCtl items={protection} open={open} onExpand={expandAll} onCollapse={collapseAll} /><button className="add-btn" onClick={addPol}><Plus size={15} /> Add</button></div></div>
                {protection.length === 0 && <p className="empty-note">No policies yet. Add life cover to model what a lump sum on death would mean for the survivor's plan.</p>}
                {protection.map((p) => {
                  const expanded = open.has(p.id);
                  const insName = (ownerOpts.filter((o) => o.value !== "joint").find((o) => o.value === (p.insured || "client1")) || {}).label || "";
                  return (
                    <div className={`rec ${expanded ? "open" : ""}`} key={p.id}>
                      <button className="rec-bar" onClick={() => toggleOpen(p.id)}>
                        <span className="swatch" style={{ background: t.accent }} />
                        <span className="rec-name-r">{p.name || "Untitled"}</span>
                        {couple && <span className="owner-chip">{insName}</span>}
                        <span className="rec-sum num">{sym}{(Number(p.sumAssured) || 0).toLocaleString()}</span>
                        <ChevronDown size={15} className="chev" />
                      </button>
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
                      <span className="field-note">Benchmark multipliers (house assumptions, saved on this device):</span>
                      <div className="pg-mult-row"><label>Life ×</label><Mini value={protMult.life} step={1} onChange={(v) => upProtMult({ life: v })} /><label>CI ×</label><Mini value={protMult.ci} step={1} onChange={(v) => upProtMult({ ci: v })} /></div>
                    </div>

                    {couple && protGap.survivor && (
                      <div className="pg-surv">
                        <label className="flbl" style={{ marginTop: 14 }}>Survivor test <InfoTip text="The real measure. The engine re-runs the whole plan assuming death at the age you choose: income stops, the survivor's spending adjusts, assets transfer, and any in-term life cover pays out. If the survivor's plan runs short, the figure shown is the additional lump sum at death that would keep it funded — computed by the engine, not a rule of thumb." /></label>
                        {protGap.survivor.map((sv) => (
                          <div className="pg-card" key={sv.k}>
                            <div className="pg-card-name">If {riskOwnerLabel(sv.k)} died at age <Mini value={sv.dAge} step={1} onChange={(v) => setDeathAges((d) => ({ ...d, [sv.k]: Math.min(sv.maxAge, Math.max(sv.minAge, Math.round(Number(v) || sv.minAge))) }))} /></div>
                            <div className="pg-row"><span>Existing life cover paying out</span><span className="num">{fmtFull(sv.payout, cur)}</span></div>
                            {sv.funded ? (
                              <div className="pg-row pg-verdict pg-ok"><span>Survivor's plan stays funded to the end</span><span className="num">✓</span></div>
                            ) : (<>
                              <div className="pg-row pg-verdict pg-gap"><span>Survivor's plan runs short from {sv.firstShortYear}</span><span className="num">−{fmtFull(sv.totalShortReal, cur)} total</span></div>
                              <div className="pg-row pg-close"><span>Additional cover that closes the gap</span><span className="num">{sv.closeGap === Infinity ? "Beyond " + fmtFull(20000000, cur) : "~" + fmtFull(Math.ceil(sv.closeGap / 10000) * 10000, cur)}</span></div>
                            </>)}
                          </div>
                        ))}
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
          </section>
        )}

        <main className="chartwrap">
          <div className="stats">
            <Stat label="Net worth today" value={fmtCompact(kpis.currentTotal, cur)} sub={couple ? `${fn1} ${ectx.age0c1} · ${fn2} ${ectx.age0c2}` : `age ${ectx.age0c1}`} />
            <Stat label="At retirement" value={fmtCompact(kpis.atRetirement, cur)} sub={ectx.retC1 <= ectx.age0c1 ? "retired" : `${fn1} age ${ectx.retC1}`} />
            <Stat label="Left at plan end" value={fmtCompact(kpis.endVal, cur)} sub={`in ${kpis.endYear}`} />
            <Stat label="Plan longevity" value={kpis.depletionAge === null ? "Fully funded" : `Age ${kpis.depletionAge}`} sub={kpis.depletionAge === null ? `to ${kpis.endYear}` : kpis.depName ? `${kpis.depName} · spendable funds short` : "spendable funds run short"} tone={kpis.tone} />
          </div>

          <div className={`banner banner-${banner.tone}`}><banner.Icon size={17} /><span>{banner.text}</span></div>

          <div className="chart-card">
            <div className="chart-head">
              <div><div className="chart-title">Net worth over time</div><div className="chart-sub">to {kpis.endYear} · {cur} · {showReal ? "today's money — what these amounts are worth now" : "future money — the actual amounts paid in each year"}{couple ? " · couple" : ""}</div></div>
              {!present && (
                <div className="head-toggles">
                  <div className="view-seg"><button className={chartView === "composition" ? "on" : ""} onClick={() => setChartView("composition")}>Composition</button><button className={chartView === "networth" ? "on" : ""} onClick={() => setChartView("networth")}>Total</button></div>
                  <div className="view-seg"><button className={moneyMode === "real" ? "on" : ""} onClick={() => setMoneyMode("real")}>Today's {sym}</button><button className={moneyMode === "nominal" ? "on" : ""} onClick={() => setMoneyMode("nominal")}>Future {sym}</button></div>
                  <button className="goal-btn" onClick={() => setGoalOpen(true)}><Target size={14} /> What if…</button>
                  <button className={`goal-btn ${stress || ci ? "on" : ""}`} onClick={() => setStressOpen(true)}><AlertTriangle size={14} /> Stress test</button>
                </div>
              )}
            </div>
            <div className="legend">
              {showComposition && legendTypes.map((ty) => <span key={ty}><i style={{ background: typeSwatch(ty) }} /> {TYPE_LABEL[ty]}</span>)}
              {hasProperty && <span><i className="line-key dash" style={{ borderTopColor: t.line }} /> Spendable (excl. property)</span>}
              {hasDebt && showComposition && <span><i className="line-key" style={{ borderTopColor: t.ink }} /> Net worth after debts</span>}
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
                <button className="wi-reset" onClick={() => { setStress(null); setCi(null); }}>Clear</button>
              </div>
            )}
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

                  {markers.retC1 && <ReferenceLine x={markers.retC1} stroke={t.ink} strokeDasharray="4 3" strokeWidth={1.4} strokeOpacity={0.8} />}
                  {markers.retC2 && <ReferenceLine x={markers.retC2} stroke={t.ink} strokeDasharray="4 3" strokeWidth={1.4} strokeOpacity={0.8} />}
                  {markers.firstDeath && <ReferenceLine x={markers.firstDeath} stroke={t.mid} strokeDasharray="2 4" strokeWidth={1.4} strokeOpacity={0.8} />}
                  {kpis.depYear && <ReferenceLine x={kpis.depYear} stroke={t.red} strokeDasharray="4 3" strokeWidth={1.5} strokeOpacity={0.9} />}
                  {payoutEvents.map((e, i) => <ReferenceLine key={`pl${i}`} x={e.year} stroke={t.green} strokeDasharray="2 3" strokeWidth={1.4} strokeOpacity={0.85} />)}
                  {showComposition
                    ? stackOrder.map((a) => <Area key={a.id} type="monotone" dataKey={aKey(a.id)} stackId="nw" stroke={colors[a.id]} strokeWidth={0.8} fill={colors[a.id]} fillOpacity={0.88} isAnimationActive={false} />)
                    : <Area type="monotone" dataKey="netWorth" stroke={t.netStroke} strokeWidth={2.4} fill="url(#nwFill)" dot={false} isAnimationActive={false} />}
                  {hasProperty && <Line type="monotone" dataKey="investable" stroke={t.line} strokeWidth={1.6} strokeDasharray="5 3" dot={false} isAnimationActive={false} />}
                  {hasDebt && showComposition && <Line type="monotone" dataKey="netWorth" stroke={t.ink} strokeWidth={1.8} dot={false} isAnimationActive={false} />}
                  {(stress || ci) && <Line type="monotone" dataKey="stressed" stroke={t.red} strokeWidth={2} strokeDasharray="6 3" dot={false} isAnimationActive={false} />}
                  {annotations.map((a, i) => (a.year ? <ReferenceLine key={a.id} x={Number(a.year)} stroke={noteColor(i)} strokeDasharray="5 4" strokeOpacity={0.85} strokeWidth={1.5} /> : null))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="cash-head">
              <div className="cash-title">Money in vs money out<span>{stress || ci ? "showing the stressed scenario — income/spending under the shock" : "each year · hover for the breakdown by source"}</span></div>
              <div className="legend sm">
                <span><i style={{ background: INCOME_LEGEND }} /> Income</span>
                <span><i style={{ background: t.amber }} /> Drawn from savings</span>
                <span><i style={{ background: t.red }} /> Shortfall</span>
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
                  {markers.retC1 && <ReferenceLine x={markers.retC1} stroke={t.ink} strokeDasharray="4 3" strokeWidth={1.4} strokeOpacity={0.8} />}
                  {markers.retC2 && <ReferenceLine x={markers.retC2} stroke={t.ink} strokeDasharray="4 3" strokeWidth={1.4} strokeOpacity={0.8} />}
                  <Tooltip content={<FlowTip />} cursor={{ fill: t.grid }} position={{ y: 10 }} />
                  {incomes.map((i) => <Bar key={i.id} dataKey={iKey(i.id)} stackId="mio" fill={incColors[i.id]} fillOpacity={0.9} isAnimationActive={false} />)}
                  <Bar dataKey="coveredBySavings" stackId="mio" fill={t.amber} fillOpacity={0.85} isAnimationActive={false} />
                  <Bar dataKey="uncovered" stackId="mio" fill={t.red} fillOpacity={0.9} isAnimationActive={false} radius={[2, 2, 0, 0]} />
                  <Line type="monotone" dataKey="expenditure" stroke={t.line} strokeWidth={2} dot={false} isAnimationActive={false} />
                  {hasContrib && <Line type="monotone" dataKey="outgoings" stroke={t.mid} strokeWidth={1.4} strokeDasharray="5 3" dot={false} isAnimationActive={false} />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </main>
        {goalOpen && goal && (() => {
          const ret1 = Number(profile.client1.retirementAge) || 0;
          const m = (v) => fmtFull(v, cur);
          const cards = [];

          if (goal.fundedNow) {
            // SPENDING
            const pctMore = goal.spend != null ? Math.round((goal.spend - 1) * 100) : null;
            if (goal.maxSpend != null && goal.curSpend > 0)
              cards.push({ Icon: Receipt, verdict: "head", q: "How much can I spend each year?", text: `Up to about ${m(goal.maxSpend)} a year in today's money and the plan still lasts for life${pctMore != null && pctMore < 400 ? ` — roughly ${pctMore}% more than the current ${m(goal.curSpend)}` : ` — well above the current ${m(goal.curSpend)}`}.`, note: "Single-lever answer: all other inputs (retirement age, growth rates, contributions) are held constant. Spending is assumed constant over time — if you'd naturally cut back in later retirement, the true ceiling is higher." });
            else
              cards.push({ Icon: Receipt, verdict: "head", q: "How much can I spend each year?", text: `Spending could rise by about ${pctMore}% and the plan would still last for life.`, note: "All other inputs held constant." });

            // RETIREMENT
            if (goal.retire != null && goal.retire < 0)
              cards.push({ Icon: User, verdict: "head", q: "When can I afford to retire?", text: `As early as age ${goal.earliestRetAge}${couple ? " each" : ""} — about ${Math.abs(goal.retire)} year${Math.abs(goal.retire) === 1 ? "" : "s"} sooner than planned — and still funded for life.`, note: `Assumes spending stays at today's level through retirement (no lifestyle reduction). Income sources (salary ending, pensions starting) follow your plan exactly as entered. If retirement spending is lower, the earliest age could be sooner.` });
            else
              cards.push({ Icon: User, verdict: "info", q: "When can I afford to retire?", text: `The planned age (${ret1}) is about the earliest that works given current spending and assets.`, note: "Assumes spending stays unchanged in retirement. If retirement costs are lower, an earlier date may be feasible." });

            // RETURNS
            if (goal.growthCapped)
              cards.push({ Icon: TrendingUp, verdict: "head", q: "What if my investments underperform?", text: "Returns could fall by more than 12 percentage points across all assets and the plan would still last — a very large cushion.", note: "Applies a uniform shift to every asset's growth rate simultaneously. Real portfolios vary by asset class." });
            else if (goal.growth != null)
              cards.push({ Icon: TrendingUp, verdict: "head", q: "What if my investments underperform?", text: `Returns could be up to ${Math.abs(goal.growth).toFixed(1)} percentage points lower across all assets and the plan would still last for life.`, note: "Applies a uniform downward shift to every asset simultaneously — a blunt but useful stress test. Individual asset underperformance could vary." });

            // ONE-OFF
            if (goal.maxOneOff != null)
              cards.push({ Icon: Landmark, verdict: "head", q: "Could I afford a big one-off purchase today?", text: goal.maxOneOff >= 5000000 ? `Even a very large one-off purchase today leaves the plan funded for life. Your liquid assets stand at ${m(goal.liquidAssets)}.` : `A one-off of about ${m(goal.maxOneOff)} today and the plan would still last for life. Your liquid assets currently stand at ${m(goal.liquidAssets)}.`, note: "The model draws the amount from your liquid assets (non-property). It does not check whether those assets are accessible or whether selling them triggers tax or penalties. It does not model property, locked pensions, or assets with surrender charges." });

            // MONTHLY
            if (goal.maxMonthly != null)
              cards.push({ Icon: Receipt, verdict: "head", q: "Could I take on a new monthly cost?", text: goal.maxMonthly >= 50000 ? "A substantial new monthly commitment would still leave the plan funded for life." : `Up to about ${m(goal.maxMonthly)} a month extra and the plan would still last for life.`, note: "Models a new expense starting today and running to the end of the plan, rising with inflation. It does not account for the cost stopping at a future date (e.g. when school fees end or a mortgage clears). A permanent test — not a temporary one." });

          } else {
            // NOT FUNDED — what would fix it
            if (goal.spend != null)
              cards.push({ Icon: Receipt, verdict: "need", q: "How much would I need to cut spending?", text: `Spending needs to drop by about ${Math.round((1 - goal.spend) * 100)}%${goal.maxSpend != null ? ` (to about ${m(goal.maxSpend)} a year)` : ""} to fully fund the plan.`, note: "All other inputs held constant. Reducing discretionary spending while keeping essentials is more realistic — the model applies the cut uniformly." });
            else
              cards.push({ Icon: Receipt, verdict: "no", q: "How much would I need to cut spending?", text: "The plan can't be funded even on a much-reduced budget — the income and asset base is the constraint.", note: "This points to an income or asset shortfall, not a spending problem." });

            if (goal.retire != null)
              cards.push({ Icon: User, verdict: "need", q: "How much longer would I need to work?", text: `About ${goal.retire} more year${goal.retire === 1 ? "" : "s"}${couple ? " each" : ` (retire at ${ret1 + goal.retire})`} fully funds the plan.`, note: "Assumes spending unchanged through retirement. Working longer adds income and delays drawdown — both help. If only one partner works, the gain is proportionally smaller." });
            else
              cards.push({ Icon: User, verdict: "no", q: "Would working longer fix it?", text: "Working longer alone doesn't close the gap within 25 years — it needs combining with lower spending or higher returns.", note: "The structural gap is too large for additional working years alone to resolve." });

            if (goal.growth != null)
              cards.push({ Icon: TrendingUp, verdict: "need", q: "What return would make this work?", text: `Returns need to be about ${goal.growth.toFixed(1)} percentage points higher across all assets to fully fund the plan (e.g. 5% becomes ~${(5 + goal.growth).toFixed(1)}%).`, note: "Applies a uniform uplift to all assets simultaneously. Chasing higher returns means accepting higher risk — discuss suitability before adjusting growth assumptions." });
            else
              cards.push({ Icon: TrendingUp, verdict: "no", q: "What return would make this work?", text: "Even a very high return can't fully fund this plan — the gap is structural.", note: "The deficit is too large to be closed by returns alone. Look at contributions, spending, or the retirement date." });
          }

          // ALWAYS SHOWN
          cards.push({ Icon: Landmark, verdict: "info", q: "How much could I leave behind?", text: `The plan is projected to leave about ${m(goal.estateEnd)} at the end of the plan (${goal.estateEndYear})${hasProperty ? ", including any property still held" : ""}.`, note: "In today's money (real terms). Before inheritance tax or estate costs. Based on current assumptions with no changes — actual estate will depend on actual returns and spending." });
          cards.push({ Icon: Shield, verdict: goal.to100 ? "head" : "need", q: "What if I live to 100?", text: goal.to100 ? "The plan still holds even if life runs to age 100." : "The plan would run short before age 100 — longevity is a real risk worth planning for.", note: "All inputs unchanged. Spending and growth rates are held constant to age 100, which may overstate costs (older retirees often spend less) or understate them (long-term care). Consider this a conservative longevity stress test." });
          return (
            <div className="modal-scrim" onClick={() => setGoalOpen(false)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-head">
                  <div><div className="modal-title">What if I asked…</div><div className="modal-sub">{goal.fundedNow ? "This plan is fully funded. Here's what the client can ask — and the answer the numbers give." : "This plan runs short. Here's what the client tends to ask — and what would close the gap."}</div></div>
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
                  <button onClick={() => { setStress(null); setCi(null); }}>Clear overlay</button>
                </div>
              )}
              <div className="goal-cards">
                {STRESS_SCENARIOS.map((s) => (
                  <button key={s.id} className={`stress-card ${stress === s.id ? "on" : ""}`} onClick={() => { if (stress === s.id) { setStress(null); } else { setStress(s.id); setCi(null); setStressOpen(false); } }}>
                    <div className="goal-card-head"><AlertTriangle size={14} /> {s.label}</div>
                    <div className="goal-card-text">{s.desc}</div>
                  </button>
                ))}
              </div>
              <div className={`ci-block ${ci ? "on" : ""}`}>
                <div className="ci-head"><Shield size={14} /> Critical illness claim</div>
                <div className="ci-text">Model a serious-illness diagnosis: a lump sum is paid and {couple ? "the affected person's" : "your"} salary-type income stops from that age. If already retired, only the lump sum applies.</div>
                <div className="rec-grid">
                  {couple && <div className="rec-field"><label>Who</label><Pick value={ciDraft.owner} onChange={(v) => setCiDraft((d) => ({ ...d, owner: v }))} options={ownerOpts.filter((o) => o.value !== "joint")} /></div>}
                  <div className="rec-field"><label>Age at claim</label><Mini value={ciDraft.age} step={1} onChange={(v) => setCiDraft((d) => ({ ...d, age: v }))} /></div>
                  <div className="rec-field"><label>Lump-sum payout</label><Money value={ciDraft.amount} symbol={sym} onChange={(v) => setCiDraft((d) => ({ ...d, amount: v }))} /></div>
                </div>
                {(() => { const ciCover = protection.filter((p) => (p.ptype || "life") === "ci" && (p.insured || "client1") === ciDraft.owner && (Number(p.coverToAge) || 0) >= (Number(ciDraft.age) || 0)).reduce((s2, p) => s2 + (Number(p.sumAssured) || 0), 0); return ciCover > 0 && Number(ciDraft.amount) !== ciCover ? <div className="ci-hint">CI cover in force at that age: <b className="num">{fmtFull(ciCover, cur)}</b> <button className="xc-btn" onClick={() => setCiDraft((d) => ({ ...d, amount: ciCover }))}>Use</button></div> : null; })()}
                <div className="ci-actions">
                  <button className="ci-apply" onClick={() => { setCi({ ...ciDraft }); setStress(null); setStressOpen(false); }}>{ci ? "Update claim overlay" : "Apply claim overlay"}</button>
                  {ci && <button className="ci-clear" onClick={() => setCi(null)}>Clear</button>}
                </div>
              </div>
              <div className="modal-foot">{(stress || ci) ? <button className="wi-reset" onClick={() => { setStress(null); setCi(null); setStressOpen(false); }}>Clear stress test</button> : "The base plan is unchanged — this only overlays a comparison line so you can show the client the plan still holds (or where it doesn't)."}</div>
            </div>
          </div>
        )}
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
          const anchorTxt = (a) => { if (!a) return "—"; if (a.mode === "now") return "Start"; if (a.mode === "retirement") return "Retirement"; if (a.mode === "end") return "End of plan"; if (a.mode === "age") return `Age ${a.age}`; return "—"; };
          const escTxt = (it) => (it.escalation === "inflation" ? `Inflation (${assumptions.inflation}%)` : it.escalation === "custom" ? `${it.customEsc || 0}%` : "None");
          const freqTxt = (it) => (it.frequency === "monthly" ? "Monthly" : it.frequency === "oneoff" ? "One-off" : it.frequency === "everyN" ? `Every ${it.everyYears || 1} yrs` : "Annual");
          const m = (v) => fmtFull(v, cur);
          const S = reportCfg.sections;
          const SECTION_DEFS = [
            { id: "exec", label: "Executive summary" },
            { id: "snapshot", label: "Financial snapshot" },
            { id: "charts", label: "Projection charts" },
            { id: "cashgap", label: "Cash gap analysis" },
            { id: "stress", label: "Stress test result", off: !stressActive, why: "no stress test active" },
            { id: "protection", label: "Protection & gap analysis", off: protection.length === 0 && !(protGap && protGap.bench.some((b) => b.inc > 0)), why: "no policies or income entered" },
            { id: "whatif", label: "\u201CWhat if I asked\u2026\u201D answers", off: !goal, why: "" },
            { id: "inputs", label: "Detailed inputs", },
            { id: "assumptions", label: "Assumptions" },
            { id: "commentary", label: "Commentary" },
          ];
          const on = (id) => { const d = SECTION_DEFS.find((x) => x.id === id); return S[id] && d && !d.off; };
          const setPreset = (kind) => {
            const brief = { exec: true, snapshot: false, charts: true, cashgap: false, stress: false, protection: false, whatif: false, inputs: false, assumptions: true, commentary: false };
            const comp = { exec: true, snapshot: true, charts: true, cashgap: true, stress: true, protection: true, whatif: true, inputs: true, assumptions: true, commentary: true };
            upReportCfg({ sections: kind === "brief" ? brief : comp });
          };
          const verdictText = kpis.depletionAge === null
            ? `Based on the assumptions set out in this report, the plan remains fully funded throughout, with approximately ${m(kpis.endVal)} of net worth remaining at the end of the plan in ${kpis.endYear}.`
            : `Based on the assumptions set out in this report, spendable assets are projected to run short around ${kpis.depYear}${kpis.depName ? ` (${anon ? (kpis.depName === fn1 ? "Client 1" : "Client 2") : kpis.depName} aged ${kpis.depletionAge})` : ` (age ${kpis.depletionAge})`}. The size of the gap is sensitive to contributions, retirement age and planned spending.`;
          const longevity = kpis.depletionAge === null ? "Funded for life" : `Funds to age ${kpis.depletionAge}`;
          const RepFoot = () => <div className="rep-foot">Illustration only — not financial advice · {clientName} · {reportDate}{reportCfg.firm ? ` · ${reportCfg.firm}` : ""}</div>;
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
                  {SECTION_DEFS.map((d) => (
                    <label key={d.id} className={`rcfg-row ${d.off ? "off" : ""}`}>
                      <input type="checkbox" disabled={!!d.off} checked={!!S[d.id] && !d.off} onChange={(e) => upReportCfg({ sections: { [d.id]: e.target.checked } })} />
                      <span>{d.label}{d.off && d.why ? <em> — {d.why}</em> : null}</span>
                    </label>
                  ))}
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
                      cashGap && !cashGap.none && !cashGap.oneOffOnly ? `Sustained draw on savings begins ${cashGap.firstYear} (~${m(cashGap.avgDraw)}/yr).` : cashGap && cashGap.oneOffOnly ? `Savings used for one-off costs only (${cashGap.isolatedYears.join(", ")}).` : `Income covers spending throughout — savings never drawn upon.`,
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
                    <div className="rep-cover-mark"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 20 L9 12 L13 15 L21 4" fill="none" stroke="#2e9e6b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /><circle cx="21" cy="4" r="2.3" fill="#2e9e6b" /></svg> Cashflow plan</div>
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
                    <div className="rep-kpi"><span>End of plan ({kpis.endYear})</span><b className="num">{m(kpis.endVal)}</b></div>
                    <div className="rep-kpi"><span>Plan longevity</span><b className="num">{longevity}</b></div>
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
                    <h2 className="rep-h2">Executive summary</h2>
                    <p className="rep-p rep-lede">{verdictText}</p>
                    <div className="rep-exec-grid">
                      <div className="rep-exec-item"><span>Annual income today</span><b className="num">{m(inc0)}</b></div>
                      <div className="rep-exec-item"><span>Annual spending today</span><b className="num">{m(exp0)}</b></div>
                      <div className="rep-exec-item"><span>Current position</span><b className="num">{inc0 - exp0 >= 0 ? `${m(inc0 - exp0)} surplus` : `${m(exp0 - inc0)} drawn from savings`}</b></div>
                      {cashGap && !cashGap.none && !cashGap.oneOffOnly && <div className="rep-exec-item"><span>Sustained draw on savings begins</span><b className="num">{cashGap.firstYear}</b></div>}
                      {cashGap && cashGap.oneOffOnly && <div className="rep-exec-item"><span>Draw on savings</span><b className="num">One-off costs only ({cashGap.isolatedYears.length} year{cashGap.isolatedYears.length === 1 ? "" : "s"})</b></div>}
                      {cashGap && cashGap.none && <div className="rep-exec-item"><span>Draw on savings</span><b className="num">None — income covers spending throughout</b></div>}
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

                {/* Charts */}
                {on("charts") && (<>
                <section className="report-page">
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
                        {markers.retC1 && <ReferenceLine x={markers.retC1} stroke="#161b22" strokeDasharray="4 3" strokeOpacity={0.6} />}
                        {markers.retC2 && <ReferenceLine x={markers.retC2} stroke="#161b22" strokeDasharray="4 3" strokeOpacity={0.6} />}
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
                    <span><i style={{ background: "#d64545" }} /> Shortfall</span>
                    <span><i className="rep-solid" /> Total spending</span>
                    {hasContrib && <span><i className="rep-dash" /> + savings/contributions</span>}
                  </div>
                  <RepFoot />
                </section>
                </>)}

                {/* Cash gap */}
                {on("cashgap") && cashGap && (
                  <section className="report-page">
                    <h2 className="rep-h2">Cash gap analysis</h2>
                    {cashGap.none ? (
                      <p className="rep-p rep-lede">Income covers spending in every year of the plan. Savings and investments are never drawn upon under the current assumptions.</p>
                    ) : cashGap.oneOffOnly ? (<>
                      <p className="rep-p rep-lede">Income covers <b>regular</b> spending in every year of the plan. Savings are drawn on only for one-off costs.</p>
                      <table className="rep-table">
                        <tbody>
                          <tr><td>Years with a one-off draw</td><td className="r num">{cashGap.isolatedYears.join(", ")}</td></tr>
                          <tr><td>Largest draw</td><td className="r num">{m(cashGap.peakDraw)} ({cashGap.peakYear})</td></tr>
                          <tr><td>Total drawn over the plan</td><td className="r num">{m(cashGap.totalDrawn)}</td></tr>
                          {cashGap.uncoveredCount > 0 && <tr><td>Years where the gap cannot be met</td><td className="r num">{cashGap.uncoveredCount}, starting {cashGap.firstUncoveredYear}</td></tr>}
                        </tbody>
                      </table>
                      <p className="rep-p">These appear as isolated orange bars on the money chart; there is no sustained reliance on savings. Figures in {basis.toLowerCase()}.</p>
                    </>) : (<>
                      <p className="rep-p rep-lede">From <b className="num">{cashGap.firstYear}</b>, spending begins to exceed income. The gap is met by drawing on savings and investments.</p>
                      <table className="rep-table">
                        <tbody>
                          <tr><td>First sustained draw on savings</td><td className="r num">{cashGap.firstYear}</td></tr>
                          <tr><td>Typical annual draw (first five years)</td><td className="r num">{m(cashGap.avgDraw)}</td></tr>
                          <tr><td>Largest annual draw</td><td className="r num">{m(cashGap.peakDraw)} ({cashGap.peakYear})</td></tr>
                          <tr><td>Total drawn over the plan</td><td className="r num">{m(cashGap.totalDrawn)}</td></tr>
                          {cashGap.uncoveredCount > 0 && <tr><td>Years where the gap cannot be met</td><td className="r num">{cashGap.uncoveredCount}, starting {cashGap.firstUncoveredYear}</td></tr>}
                        </tbody>
                      </table>
                      <p className="rep-p">{cashGap.uncoveredCount > 0 ? "Where the gap cannot be met, spending in those years exceeds both income and remaining accessible assets — shown in red on the money chart." : "Every gap year is fully met from accessible assets under the current assumptions."} Figures in {basis.toLowerCase()}.</p>
                    </>)}
                    {stressActive && <p className="rep-p rep-small">Computed on the base plan — the active stress scenario is reported on its own page.</p>}
                    <RepFoot />
                  </section>
                )}

                {/* Stress test */}
                {on("stress") && stressImpact && (
                  <section className="report-page">
                    <h2 className="rep-h2">Stress test</h2>
                    <p className="rep-p rep-lede">Scenario applied: <b>{stressImpact.label}</b></p>
                    <table className="rep-table">
                      <tbody>
                        <tr><td>Base plan</td><td className="r">{stressImpact.baseAge ? `Funds to age ${stressImpact.baseAge}` : "Funded for life"}</td></tr>
                        <tr><td>Under this scenario</td><td className="r">{stressImpact.stressAge ? `Funds to age ${stressImpact.stressAge}` : "Still funded for life"}</td></tr>
                      </tbody>
                    </table>
                    <p className="rep-p">{!stressImpact.stressAge ? "Under this scenario the plan remains funded to the end of the projection." : stressImpact.baseAge ? `The scenario brings the projected depletion forward from age ${stressImpact.baseAge} to age ${stressImpact.stressAge}.` : `The scenario moves the plan from fully funded to depleting at age ${stressImpact.stressAge}.`} This is a what-if illustration of resilience, not a prediction.</p>
                    <div className="rep-chart">
                      <ComposedChart width={700} height={260} data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                        <CartesianGrid stroke="#eceff3" vertical={false} />
                        <XAxis dataKey="year" tick={{ fill: "#6b7480", fontSize: 10 }} axisLine={{ stroke: "#dfe3e9" }} tickLine={false} interval={Math.max(0, Math.floor(data.length / 9))} />
                        <YAxis tickFormatter={(v) => fmtCompact(v, cur)} tick={{ fill: "#6b7480", fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
                        <Line type="monotone" dataKey="netWorth" stroke="#161b22" strokeWidth={1.7} dot={false} isAnimationActive={false} />
                        <Line type="monotone" dataKey="stressed" stroke="#d64545" strokeWidth={1.7} strokeDasharray="6 3" dot={false} isAnimationActive={false} />
                      </ComposedChart>
                    </div>
                    <div className="rep-legend"><span><i className="rep-solid" /> Base plan net worth</span><span><i className="rep-dash" style={{ background: "#d64545" }} /> Under the scenario</span></div>
                    <RepFoot />
                  </section>
                )}

                {/* Protection snapshot */}
                {on("protection") && (protSnap || protGap) && (
                  <section className="report-page">
                    <h2 className="rep-h2">Protection</h2>
                    {protection.length === 0 && <p className="rep-p rep-lede">No policies are currently recorded — the benchmark below measures the full gap.</p>}
                    {protection.length > 0 && <table className="rep-table">
                      <thead><tr><th>Policy</th><th>Insured</th><th>Type</th><th className="r">Sum assured</th><th className="r">Premium</th><th className="r">Cover to</th></tr></thead>
                      <tbody>{protection.map((p2) => <tr key={p2.id}><td>{p2.name}</td><td>{insuredLabel(p2.insured)}</td><td>{(p2.ptype || "life") === "ci" ? "Critical illness" : "Life"}</td><td className="r num">{m(Number(p2.sumAssured) || 0)}</td><td className="r num">{sym}{(Number(p2.premium) || 0).toLocaleString()}/mo</td><td className="r num">{Number(p2.coverToAge) >= 110 ? "Whole of life" : `Age ${p2.coverToAge}`}</td></tr>)}</tbody>
                    </table>}
                    {protSnap && Object.entries(protSnap.per).map(([k, v]) => (
                      <p className="rep-p" key={k}><b>{insuredLabel(k)}:</b> {v.count} polic{v.count === 1 ? "y" : "ies"} totalling {m(v.total)} of cover, costing {sym}{v.prem.toLocaleString()}/month.</p>
                    ))}
                    {protGap && (<>
                      <h2 className="rep-h2" style={{ marginTop: 22 }}>Protection gap analysis</h2>
                      <table className="rep-table">
                        <thead><tr><th></th><th className="r">Income/yr</th><th className="r">Life {protMult.life}× benchmark</th><th className="r">In force</th><th className="r">Life gap</th><th className="r">CI {protMult.ci}× benchmark</th><th className="r">In force</th><th className="r">CI gap</th></tr></thead>
                        <tbody>
                          {protGap.bench.map((b) => (
                            <tr key={b.k}><td>{b.k === "client2" ? dfn2 : dfn1}</td><td className="r num">{m(b.inc)}</td><td className="r num">{m(b.lifeNeed)}</td><td className="r num">{m(b.lifeHave)}</td><td className="r num">{b.lifeGap > 0 ? m(b.lifeGap) : "—"}</td><td className="r num">{m(b.ciNeed)}</td><td className="r num">{m(b.ciHave)}</td><td className="r num">{b.ciGap > 0 ? m(b.ciGap) : "—"}</td></tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="rep-p rep-small">Benchmarks are a rule-of-thumb starting point ({protMult.life}× income for life cover, {protMult.ci}× for critical illness; joint income split equally). They are not a needs analysis.</p>
                      {protGap.survivor && protGap.survivor.map((sv) => (
                        <p className="rep-p" key={sv.k}>If {sv.k === "client2" ? dfn2 : dfn1} died at age {sv.dAge}: existing cover of {m(sv.payout)} would pay out, and the survivor's plan {sv.funded ? "remains funded to the end of the projection" : `runs short from ${sv.firstShortYear} by ${m(sv.totalShortReal)} in total (today's money) — additional cover of ${sv.closeGap === Infinity ? "more than " + m(20000000) : "approximately " + m(Math.ceil(sv.closeGap / 10000) * 10000)} at death would close the gap`}.</p>
                      ))}
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
                    <h2 className="rep-h2">"What if I asked…"</h2>
                    <p className="rep-p">Single-question answers computed from this plan. Each changes one input only, holding everything else constant — read the note beneath the table.</p>
                    <table className="rep-table">
                      <tbody>
                        <tr><td>How much could I spend each year and still be funded for life?</td><td className="r num">{goal.maxSpend != null ? `~${m(goal.maxSpend)}/yr` : "—"}</td></tr>
                        <tr><td>When could I retire at today's spending?</td><td className="r num">{goal.earliestRetAge != null ? `Age ${goal.earliestRetAge}` : "—"}</td></tr>
                        <tr><td>Largest one-off purchase today, staying funded?</td><td className="r num">{goal.maxOneOff != null ? (goal.maxOneOff >= 5000000 ? "Over " + m(5000000) : `~${m(goal.maxOneOff)}`) : "—"}</td></tr>
                        <tr><td>Largest new permanent monthly cost, staying funded?</td><td className="r num">{goal.maxMonthly != null ? `~${sym}${Math.round(goal.maxMonthly).toLocaleString()}/mo` : "—"}</td></tr>
                        {!goal.to100 && goal.growth != null && <tr><td>Return uplift needed to fully fund the plan</td><td className="r num">+{goal.growth.toFixed(1)} pts on all assets</td></tr>}
                        <tr><td>Projected estate at the end of the plan</td><td className="r num">{m(goal.estateEnd)} ({goal.estateEndYear})</td></tr>
                      </tbody>
                    </table>
                    <p className="rep-p rep-small">Each answer adjusts a single lever in isolation and assumes it stays constant over time; combining changes gives different results. The one-off figure does not test the accessibility or tax treatment of specific assets. These are planning illustrations, not recommendations.</p>
                    <RepFoot />
                  </section>
                )}

                {/* Detailed inputs */}
                {on("inputs") && (<>
                <section className="report-page">
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
                        <tr key={i.id}><td>{i.name}</td><td>{ownerLabel(i.owner)}</td><td className="r num">{sym}{(Number(i.amount) || 0).toLocaleString()}</td><td>{freqTxt(i)}</td><td>{anchorTxt(i.start)}</td><td>{i.frequency === "oneoff" ? "—" : anchorTxt(i.end)}</td><td>{escTxt(i)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  <RepFoot />
                </section>
                <section className="report-page">
                  <h2 className="rep-h2">Expenditure</h2>
                  <table className="rep-table">
                    <thead><tr><th>Item</th><th>Owner</th><th className="r">Amount</th><th>Frequency</th><th>From</th><th>To</th><th>Priority</th></tr></thead>
                    <tbody>
                      {expenses.length === 0 ? <tr><td colSpan={7} className="rep-empty">No expenditure entered.</td></tr> : expenses.map((e) => (
                        <tr key={e.id}><td>{e.name}</td><td>{ownerLabel(e.owner)}</td><td className="r num">{sym}{(Number(e.amount) || 0).toLocaleString()}</td><td>{freqTxt(e)}</td><td>{anchorTxt(e.start)}</td><td>{e.frequency === "oneoff" ? "—" : anchorTxt(e.end)}</td><td>{e.priority === "discretionary" ? "Discretionary" : "Essential"}</td></tr>
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

                {/* Commentary */}
                {on("commentary") && commentaryText && (
                  <section className="report-page">
                    <h2 className="rep-h2">Commentary</h2>
                    {commentaryText.split(/\n\n+/).map((para, i) => <p className="rep-p" key={i}>{para}</p>)}
                    <RepFoot />
                  </section>
                )}

                {/* Disclaimers — always */}
                <section className="report-page report-last">
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
  return (
    <div className="wi-slider">
      <div className="wi-srow"><span className="wi-label">{label}</span><span className={`wi-val num ${value !== 0 ? "on" : ""}`}>{fmt(value)}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
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
.app-root{font-family:'Hanken Grotesk',ui-sans-serif,sans-serif;background:var(--bg);color:var(--ink);height:100%;min-height:100%;width:100%;-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;}
.app-root *{box-sizing:border-box;}
.num{font-family:'Hanken Grotesk',ui-sans-serif,sans-serif;font-variant-numeric:tabular-nums;}

.topbar{display:flex;align-items:center;justify-content:space-between;padding:12px 20px;border-bottom:1px solid var(--border);background:var(--panel);position:sticky;top:0;z-index:30;flex:none;}
.brand{display:flex;align-items:center;gap:11px;}
.brand-mark{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;background:var(--bg);border:1px solid var(--border);}
.brand-text{display:flex;flex-direction:column;line-height:1.12;}
.brand-name{font-family:'Fraunces',serif;font-weight:600;font-size:19px;letter-spacing:-0.01em;}
.brand-tag{font-size:11.5px;color:var(--mid);}
.topbar-tools{display:flex;align-items:center;gap:9px;}
.cur-sel{background:var(--bg);border:1px solid var(--border);color:var(--ink);border-radius:8px;padding:7px 9px;font-size:12.5px;cursor:pointer;}
.icon-btn{background:var(--bg);border:1px solid var(--border);color:var(--mid);border-radius:8px;width:34px;height:34px;display:grid;place-items:center;cursor:pointer;transition:.15s;}
.icon-btn:hover{color:var(--ink);border-color:var(--border-strong);}
.btn-primary{display:flex;align-items:center;gap:7px;background:var(--accent);color:#fff;border:none;border-radius:8px;padding:8px 13px;font-size:13px;font-weight:600;cursor:pointer;transition:.15s;}
.btn-primary:hover{filter:brightness(1.08);}

.app{display:grid;grid-template-columns:204px 360px 1fr;flex:1;min-height:0;}
.app.present{grid-template-columns:1fr;}

.rail{background:var(--rail);border-right:1px solid var(--border);padding:16px 12px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;}

.rail-group{display:flex;flex-direction:column;gap:3px;}
.rail-item{display:flex;align-items:center;gap:11px;width:100%;background:transparent;border:none;color:var(--mid);padding:9px 11px;border-radius:9px;font-size:13.5px;font-weight:500;cursor:pointer;font-family:inherit;transition:.13s;text-align:left;}
.rail-item:hover{background:var(--accent-soft);color:var(--ink);}
.rail-item.active{background:var(--accent);color:#fff;}
.rail-item.soon{cursor:default;opacity:.5;}
.rail-item.soon:hover{background:transparent;color:var(--mid);}
.soon-pill{margin-left:auto;font-size:9.5px;font-weight:600;letter-spacing:.04em;background:var(--border);color:var(--mid);padding:2px 6px;border-radius:5px;text-transform:uppercase;}
.rail-divider{height:1px;background:var(--border);margin:4px 6px;}

.tabbar{display:none;gap:6px;padding:10px 14px;border-bottom:1px solid var(--border);background:var(--panel);overflow-x:auto;}
.tab{display:flex;align-items:center;gap:6px;white-space:nowrap;background:var(--bg);border:1px solid var(--border);color:var(--mid);padding:7px 12px;border-radius:8px;font-size:12.5px;font-weight:500;font-family:inherit;cursor:pointer;}
.tab.active{background:var(--accent);color:#fff;border-color:var(--accent);}

.editor{border-right:1px solid var(--border);background:var(--panel);overflow-y:auto;min-height:0;}
.ed-body{padding:18px 16px;display:flex;flex-direction:column;gap:13px;}
.ed-head{display:flex;align-items:center;justify-content:space-between;}
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
.anchor-yr{font-size:11.5px;color:var(--low);white-space:nowrap;}
.ed-title{font-family:'Fraunces',serif;font-size:18px;font-weight:600;margin:0;}
.add-btn{display:flex;align-items:center;gap:5px;background:var(--accent-soft);color:var(--accent);border:1px solid var(--border);border-radius:8px;padding:6px 11px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;}
.add-btn.wide{width:100%;justify-content:center;padding:9px;margin-top:4px;}
.tax-enable{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;background:var(--bg);border:1px solid var(--border);border-radius:11px;padding:13px 14px;margin-bottom:4px;}
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
.text-in{background:var(--bg);border:1px solid var(--border);color:var(--ink);border-radius:8px;padding:9px 11px;font-size:13.5px;font-family:inherit;width:100%;}
.text-in:focus,.money-in:focus,.mininum input:focus,.rec-name:focus,.pick:focus,.anchor-age:focus{outline:none;border-color:var(--accent);}
.ed-hint{font-size:11.5px;color:var(--low);line-height:1.5;margin:6px 0 0;border-top:1px solid var(--border);padding-top:12px;}
.empty-note{font-size:12.5px;color:var(--low);line-height:1.5;padding:10px 0;}

.couple-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--bg);border:1px solid var(--border);border-radius:11px;padding:12px 13px;}
.ct-title{font-size:13.5px;font-weight:600;}
.ct-sub{font-size:11px;color:var(--low);margin-top:2px;}
.client-label{font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.05em;margin-top:4px;}
.client-card{background:var(--bg);border:1px solid var(--border);border-radius:11px;padding:13px;display:flex;flex-direction:column;gap:11px;}

.rec{background:var(--bg);border:1px solid var(--border);border-radius:11px;overflow:hidden;}
.rec.open{border-color:var(--border-strong);box-shadow:var(--shadow);}
.rec-bar{display:flex;align-items:center;gap:8px;width:100%;background:transparent;border:none;padding:11px 12px;cursor:pointer;font-family:inherit;text-align:left;color:var(--ink);}
.swatch{width:11px;height:11px;border-radius:3px;flex:none;}
.rec-name-r{flex:1;font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.owner-chip{font-size:9.5px;font-weight:600;padding:2px 6px;border-radius:5px;background:var(--accent-soft);color:var(--accent);white-space:nowrap;}
.prio{font-size:9.5px;font-weight:600;padding:2px 6px;border-radius:5px;text-transform:uppercase;letter-spacing:.03em;}
.prio.essential{background:var(--accent-soft);color:var(--accent);}
.prio.discretionary{background:var(--track);color:var(--mid);}
.rec-sum{font-size:12.5px;color:var(--mid);white-space:nowrap;}
.rec-sum em{font-style:normal;color:var(--low);font-size:11px;}
.chev{color:var(--low);transition:.18s;flex:none;}
.rec.open .chev{transform:rotate(180deg);}
.rec-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:13px;border-top:1px solid var(--border);}
.flbl{font-size:11px;color:var(--low);font-weight:500;margin-top:11px;}
.rec-name{background:var(--panel);border:1px solid var(--border);border-radius:8px;color:var(--ink);font-size:13.5px;font-weight:600;font-family:inherit;padding:9px 10px;}
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
.seg2 button.on{background:var(--accent);color:#fff;}
.del-row{display:flex;align-items:center;justify-content:center;gap:6px;background:transparent;border:1px solid var(--border);color:var(--low);border-radius:8px;padding:8px;font-size:12px;font-family:inherit;cursor:pointer;}
.del-row:hover{color:var(--red);border-color:var(--red);}

.chartwrap{padding:18px 20px;display:flex;flex-direction:column;gap:13px;min-width:0;overflow-y:auto;min-height:0;position:sticky;top:0;align-self:start;max-height:100vh;}
.app.present .chartwrap{padding:22px 36px;gap:16px;}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;}
.stat{background:var(--card);border:1px solid var(--border);border-radius:13px;padding:13px 15px;box-shadow:var(--shadow);}
.stat-label{font-size:12px;color:var(--mid);font-weight:500;margin-bottom:5px;}
.stat-value{font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.05;}
.stat-sub{font-size:11.5px;color:var(--low);margin-top:3px;}
.stat-green .stat-value{color:var(--green);} .stat-amber .stat-value{color:var(--amber);} .stat-red .stat-value{color:var(--red);}

.banner{display:flex;align-items:center;gap:10px;padding:11px 15px;border-radius:11px;font-size:13.5px;font-weight:500;border:1px solid var(--border);}
.banner svg{flex:none;}
.banner-green{background:color-mix(in srgb,var(--green) 9%,transparent);color:var(--green);border-color:color-mix(in srgb,var(--green) 26%,transparent);}
.banner-amber{background:color-mix(in srgb,var(--amber) 10%,transparent);color:var(--amber);border-color:color-mix(in srgb,var(--amber) 28%,transparent);}
.banner-red{background:color-mix(in srgb,var(--red) 9%,transparent);color:var(--red);border-color:color-mix(in srgb,var(--red) 26%,transparent);}

.chart-card{background:var(--card);border:1px solid var(--border);border-radius:15px;padding:16px 17px 14px;display:flex;flex-direction:column;box-shadow:var(--shadow);}
.chart-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;}
.chart-title{font-family:'Fraunces',serif;font-size:17px;font-weight:600;}
.chart-sub{font-size:12px;color:var(--low);margin-top:1px;}
.head-toggles{display:flex;gap:8px;flex-wrap:wrap;}
.view-seg{display:flex;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:3px;gap:2px;}
.view-seg button{border:none;background:transparent;color:var(--mid);font-family:inherit;font-size:11.5px;font-weight:600;padding:5px 10px;border-radius:6px;cursor:pointer;white-space:nowrap;}
.view-seg button.on{background:var(--accent);color:#fff;}
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
.goal-btn:hover{background:var(--accent);color:#fff;}
.goal-btn.on{background:var(--red);border-color:var(--red);color:#fff;}
.stress-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px;padding:8px 12px;border:1px solid var(--red);border-radius:9px;background:color-mix(in srgb, var(--red) 8%, transparent);}
.stress-tag{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--red);}
.stress-impact{font-size:12px;color:var(--mid);}
.stress-bar .wi-reset{margin-left:auto;}
.stress-card{text-align:left;border:1px solid var(--border);border-left-width:3px;border-left-color:var(--border);border-radius:10px;padding:12px 14px;background:var(--bg);cursor:pointer;font-family:inherit;width:100%;transition:border-color .12s;}
.stress-card:hover{border-left-color:var(--red);}
.stress-card.on{border-left-color:var(--red);background:color-mix(in srgb, var(--red) 7%, transparent);}
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
.modal-title{font-family:'Fraunces',serif;font-size:21px;font-weight:600;color:var(--ink);}
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
.report-overlay{position:fixed;inset:0;z-index:300;background:#f3f4f6;overflow:auto;color:#1a1f28;font-family:"Hanken Grotesk",ui-sans-serif,system-ui,sans-serif;}
.report-toolbar{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 18px;background:#fff;border-bottom:1px solid #e2e6ec;}
.report-tb-title{display:flex;align-items:center;gap:8px;font-weight:600;font-size:13.5px;}
.report-sheet{max-width:820px;margin:22px auto;background:#fff;border:1px solid #e2e6ec;border-radius:6px;padding:46px 52px;box-shadow:0 8px 30px rgba(20,30,50,.06);}
.report-page{padding-bottom:34px;margin-bottom:34px;border-bottom:1px solid #eef1f4;}
.report-page.report-last{border-bottom:none;margin-bottom:0;}
.rep-cover{margin-bottom:26px;}
.rep-cover-mark{display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;color:#2e9e6b;letter-spacing:.02em;text-transform:uppercase;}
.rep-h1{font-family:"Fraunces",Georgia,serif;font-size:34px;font-weight:600;margin:10px 0 6px;letter-spacing:-.01em;}
.rep-meta{font-size:12.5px;color:#7a8493;}
.rep-h2{font-family:"Fraunces",Georgia,serif;font-size:19px;font-weight:600;margin:0 0 4px;}
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
.rep-empty{color:#9aa3b0;font-style:italic;}
.rep-notes{margin:0;padding-left:18px;font-size:12.5px;color:#2a3038;line-height:1.7;}
.rep-disc{font-size:11px;color:#7a8493;line-height:1.55;margin:0 0 10px;}
@media print {
  body * { visibility: hidden; }
  .report-overlay, .report-overlay * { visibility: visible; }
  .report-overlay { position: absolute; inset: 0; background: #fff; overflow: visible; }
  .report-no-print { display: none !important; }
  .report-sheet { margin: 0; border: none; border-radius: 0; box-shadow: none; padding: 0; max-width: none; }
  .report-page { page-break-after: always; border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
  .report-page.report-last { page-break-after: auto; }
  .rep-table, .rep-kpi, .rep-chart, .rep-verdict { break-inside: avoid; }
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
