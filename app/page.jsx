"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RouteGuard from "../components/RouteGuard";
import { useAuth } from "../lib/AuthProvider";
import { listClients, createClient, renameClient, deleteClient } from "../lib/store";

function Dashboard() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function refresh() {
    try {
      setClients(await listClients());
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  async function onNew() {
    const name = prompt("Client name (you can change it later):", "New client");
    if (name === null) return;
    try {
      const c = await createClient(name.trim() || "New client");
      router.push(`/plan/${c.id}`);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function onRename(c, e) {
    e.stopPropagation();
    const name = prompt("Rename client:", c.display_name);
    if (name === null) return;
    await renameClient(c.id, name.trim() || c.display_name);
    refresh();
  }

  async function onDelete(c, e) {
    e.stopPropagation();
    if (!confirm(`Delete “${c.display_name}” and all its plans? This cannot be undone.`)) return;
    await deleteClient(c.id);
    refresh();
  }

  const fmtDate = (s) => new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="shell">
      <div className="shell-top">
        <div className="brand">Meridian<small>{user?.email}</small></div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-primary" onClick={onNew}>+ New client</button>
          <button className="btn" onClick={signOut}>Sign out</button>
        </div>
      </div>

      {err && <div className="auth-err">{err}</div>}

      {loading ? (
        <div className="empty-state">Loading clients…</div>
      ) : clients.length === 0 ? (
        <div className="empty-state">
          <p>No clients yet.</p>
          <button className="btn btn-primary" onClick={onNew}>Create your first client</button>
        </div>
      ) : (
        <div className="client-grid">
          {clients.map((c) => (
            <div key={c.id} className="client-card" onClick={() => router.push(`/plan/${c.id}`)}>
              <h3>{c.display_name}</h3>
              <div className="meta">Updated {fmtDate(c.updated_at)}</div>
              <div className="row">
                <button className="btn btn-ghost" onClick={(e) => onRename(c, e)}>Rename</button>
                <button className="btn btn-ghost btn-danger" onClick={(e) => onDelete(c, e)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <RouteGuard>
      <Dashboard />
    </RouteGuard>
  );
}
