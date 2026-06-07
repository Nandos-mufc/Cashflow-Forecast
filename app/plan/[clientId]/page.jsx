"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import RouteGuard from "../../../components/RouteGuard";
import RunwayApp from "../../../components/RunwayApp";
import { getClient, getOrCreateBasePlan, savePlan } from "../../../lib/store";
import { emptyPlan } from "../../../lib/defaultPlan";

function Editor() {
  const { clientId } = useParams();
  const router = useRouter();

  const [client, setClient] = useState(null);
  const [plan, setPlan] = useState(null); // { id, name, data }
  const [status, setStatus] = useState("saved"); // saved | saving | unsaved | error
  const [err, setErr] = useState("");

  const timer = useRef(null);
  const lastSaved = useRef(""); // JSON of last persisted data, to skip no-op saves

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [c, p] = await Promise.all([getClient(clientId), getOrCreateBasePlan(clientId)]);
        if (!active) return;
        const data = p.data && Object.keys(p.data).length ? p.data : emptyPlan();
        setClient(c);
        setPlan({ ...p, data });
        lastSaved.current = JSON.stringify(data);
      } catch (e) {
        if (active) setErr(e.message);
      }
    })();
    return () => { active = false; };
  }, [clientId]);

  // Debounced autosave. RunwayApp emits the full plan whenever anything changes.
  const handleChange = useCallback(
    (data) => {
      const json = JSON.stringify(data);
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

  // Flush a pending save if the user navigates away.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (err) return <div className="center-screen">{err}</div>;
  if (!plan || !client) return <div className="center-screen">Loading plan…</div>;

  const statusText = { saved: "All changes saved", saving: "Saving…", unsaved: "Unsaved changes", error: "Save failed — retrying on next change" }[status];

  return (
    <div className="plan-shell">
      <div className="plan-bar">
        <button className="btn btn-ghost" onClick={() => router.push("/")}>← Clients</button>
        <span className="name">{client.display_name}</span>
        <span className="save">
          <span className={`save-dot ${status}`} /> {statusText}
        </span>
      </div>
      <div className="plan-body">
        <RunwayApp key={plan.id} initialData={plan.data} onChange={handleChange} />
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
