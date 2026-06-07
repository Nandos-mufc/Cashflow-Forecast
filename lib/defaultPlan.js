// The canonical shape of a saved plan. Keep this in sync with the state
// RunwayApp assembles in its onChange emitter. New clients start from
// emptyPlan(); loaded clients come straight from the database.

let _seq = 0;
export const uid = () =>
  `id_${Date.now().toString(36)}_${(_seq++).toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const taxDefault = () => ({
  enabled: false,
  cgtRate: 0,
  periods: [
    { id: uid(), label: "Tax-free", startMode: "now", startAge: 0, personalAllowance: 0, bands: [] },
  ],
});

export function emptyPlan() {
  return {
    profile: {
      couple: false,
      currency: "GBP",
      client1: { name: "", dob: "1980-01-01", retirementAge: 60, lifeExpectancy: 90 },
      client2: { name: "", dob: "1982-01-01", retirementAge: 60, lifeExpectancy: 92 },
    },
    assumptions: { inflation: 2.5, survivorExpenseFactor: 67, tax: taxDefault() },
    assets: [],
    incomes: [],
    expenses: [],
    liabilities: [],
    protection: [],
    annotations: [],
  };
}

// A human-friendly label for the client list, derived from the plan's people.
export function planLabel(data) {
  const p = data && data.profile;
  if (!p) return "New client";
  const n1 = (p.client1 && p.client1.name && p.client1.name.trim()) || "";
  const n2 = (p.client2 && p.client2.name && p.client2.name.trim()) || "";
  if (p.couple && n1 && n2) return `${n1} & ${n2}`;
  return n1 || n2 || "";
}
