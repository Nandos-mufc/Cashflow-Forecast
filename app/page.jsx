"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import RouteGuard from "../../../components/RouteGuard";
import RunwayApp from "../../../components/RunwayApp";
import { getClient, getOrCreateBasePlan, getPlan, listPlans, createPlan, deletePlan, renamePlan, savePlan } from "../../../lib/store";
import { emptyPlan } from "../../../lib/defaultPlan";

function Editor() {
  const { clientId } = useParams();
  const router = useRouter();

  const [client, setClient] = useState(null);
  const [plan, setPlan] = useState(null); // active plan { id, name, data }
  const [scenarios, setScenarios] = useState([]); // [{ id, name, updated_at }]
  const [compareId, setCompareId] = useState(null);
  const [compareData, setCompareData] = useState(null); // full data of the comparison plan
  const [status, setStatus] = useState("saved"); // saved | saving | unsaved | error
  const [err, setErr] = useState("");

  const timer = useRef(null);
  const lastSaved = useRef(""); // JSON of last persisted data, to skip no-op saves
  const pending = useRef(null); // latest unsaved data, so we can flush before switching

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [c, p, list] = await Promise.all([getClient(clientId), getOrCreateBasePlan(clientId), listPlans(clientId)]);
        if (!active) return;
        const data = p.data && Object.keys(p.data).length ? p.data : emptyPlan();
        setClient(c);
        setPlan({ ...p, data });
        setScenarios(list.length ? list : [{ id: p.id, name: p.name, updated_at: p.updated_at }]);
        lastSaved.current = JSON.stringify(data);
      } catch (e) {
        if (active) setErr(e.message);
      }
    })();
    return () => { active = false; };
  }, [clientId]);

  // Persist immediately, cancelling any pending debounce. Used before switching scenarios.
  const flushSave = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!plan || !pending.current) return;
    const json = JSON.stringify(pending.current);
    if (json === lastSaved.current) return;
    setStatus("saving");
    try {
      await savePlan(plan.id, clientId, pending.current, plan.name);
      lastSaved.current = json;
      setStatus("saved");
    } catch (e) { setErr(e.message); setStatus("error"); }
  }, [plan, clientId]);

  // Debounced autosave. RunwayApp emits the full plan whenever anything changes.
  const handleChange = useCallback(
    (data) => {
      const json = JSON.stringify(data);
      pending.current = data;
      if (json === lastSaved.current) return; // no real change (e.g. initial emit)
      setStatus("unsaved");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        setStatus("saving");
        try {
          await savePlan(plan.id, clientId, data, plan.name);
          lastSaved.current = json;
          setStatus("saved");
        } catch (e) {
          setErr(e.message);
          setStatus("error");
        }
      }, 900);
    },
    [plan, clientId]
  );

  // Scenario actions raised from inside RunwayApp.
  const onScenarioAction = useCallback(async (action) => {
    try {
      if (action.type === "switch") {
        if (action.id === plan?.id) return;
        await flushSave();
        const p = await getPlan(action.id);
        const data = p.data && Object.keys(p.data).length ? p.data : emptyPlan();
        setPlan({ ...p, data });
        lastSaved.current = JSON.stringify(data);
        pending.current = null;
        setStatus("saved");
        if (action.id === compareId) { setCompareId(null); setCompareData(null); } // can't compare with itself
      }
      if (action.type === "create") {
        await flushSave();
        const src = action.data || plan?.data || emptyPlan();
        const name = action.name || `Scenario ${scenarios.length + 1}`;
        const row = await createPlan(clientId, name, JSON.parse(JSON.stringify(src)));
        const list = await listPlans(clientId);
        setScenarios(list);
        // switch straight into the new scenario so the adviser can start editing it
        const p = await getPlan(row.id);
        setPlan({ ...p, data: p.data });
        lastSaved.current = JSON.stringify(p.data);
        pending.current = null;
        setStatus("saved");
      }
      if (action.type === "rename") {
        await renamePlan(action.id, action.name);
        setScenarios((s) => s.map((x) => (x.id === action.id ? { ...x, name: action.name } : x)));
        if (plan?.id === action.id) setPlan((p) => ({ ...p, name: action.name }));
      }
      if (action.type === "delete") {
        if (scenarios.length <= 1) return; // never delete the last plan
        await deletePlan(action.id);
        const list = await listPlans(clientId);
        setScenarios(list);
        if (compareId === action.id) { setCompareId(null); setCompareData(null); }
        if (plan?.id === action.id && list.length) {
          const p = await getPlan(list[0].id);
          const data = p.data && Object.keys(p.data).length ? p.data : emptyPlan();
          setPlan({ ...p, data });
          lastSaved.current = JSON.stringify(data);
          pending.current = null;
          setStatus("saved");
        }
      }
      if (action.type === "compare") {
        if (!action.id || action.id === compareId) { setCompareId(null); setCompareData(null); return; }
        const p = await getPlan(action.id);
        setCompareId(action.id);
        setCompareData(p.data && Object.keys(p.data).length ? p.data : null);
      }
    } catch (e) { setErr(e.message); }
  }, [plan, clientId, scenarios.length, compareId, flushSave]);

  // Flush a pending save if the user navigates away.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (err) return <div className="center-screen">{err}</div>;
  if (!plan || !client) return <div className="center-screen">Loading plan…</div>;

  const statusText = { saved: "All changes saved", saving: "Saving…", unsaved: "Unsaved changes", error: "Save failed — retrying on next change" }[status];
  const compareName = compareId ? (scenarios.find((s) => s.id === compareId) || {}).name : null;

  return (
    <div className="plan-shell">
      <div className="plan-bar">
        <button className="btn btn-ghost" onClick={() => router.push("/")}>← Clients</button>
        <span className="name">{client.display_name}</span>
        {scenarios.length > 1 && <span className="plan-pill">{plan.name}</span>}
        <span className="save">
          <span className={`save-dot ${status}`} /> {statusText}
        </span>
      </div>
      <div className="plan-body">
        <RunwayApp
          key={plan.id}
          initialData={plan.data}
          onChange={handleChange}
          scenarios={scenarios}
          activeScenarioId={plan.id}
          compareScenarioId={compareId}
          compareName={compareName}
          compareData={compareData}
          onScenarioAction={onScenarioAction}
        />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <RouteGuard>
      <Editor />
    </RouteGuard>
  );
}
