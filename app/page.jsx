"use client";

import { useEffect, useRef, useState } from "react";
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

  // In-app dialogs replace the native prompt()/confirm().
  const [modal, setModal] = useState(null);        // { type: "new" } | { type: "delete", client }
  const [modalName, setModalName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null); // client whose name is being edited inline
  const [editName, setEditName] = useState("");
  const editRef = useRef(null);

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
  useEffect(() => { if (editingId && editRef.current) editRef.current.select(); }, [editingId]);

  function openNew() { setModalName("New client"); setModal({ type: "new" }); }

  async function confirmNew() {
    if (busy) return;
    setBusy(true);
    try {
      const c = await createClient(modalName.trim() || "New client");
      setModal(null);
      router.push(`/plan/${c.id}`);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  function startRename(c, e) {
    e.stopPropagation();
    setEditingId(c.id);
    setEditName(c.display_name);
  }

  // Optimistic rename: update the card immediately, persist, then reconcile against the server.
  async function commitRename(c) {
    const name = editName.trim() || c.display_name;
    setEditingId(null);
    if (name === c.display_name) return;
    setClients((cs) => cs.map((x) => (x.id === c.id ? { ...x, display_name: name } : x)));
    try {
      await renameClient(c.id, name);
      refresh();
    } catch (e) {
      setErr(e.message);
      refresh(); // fall back to server truth on failure
    }
  }

  function openDelete(c, e) { e.stopPropagation(); setModal({ type: "delete", client: c }); }

  async function confirmDelete() {
    if (busy || !modal?.client) return;
    setBusy(true);
    try {
      await deleteClient(modal.client.id);
      setModal(null);
      setBusy(false);
      refresh();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  const fmtDate = (s) => new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  // Self-contained dialog styling so this doesn't depend on global CSS being present.
  const overlay = { position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 };
  const box = { background: "var(--card, #fff)", color: "var(--ink, #0f172a)", borderRadius: 14, padding: "22px 22px 18px", width: "min(420px, 100%)", boxShadow: "0 20px 60px rgba(0,0,0,.25)" };
  const inputStyle = { width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 15, border: "1px solid var(--border, #cbd5e1)", borderRadius: 9, marginTop: 10, outline: "none" };

  return (
    <div className="shell">
      <div className="shell-top">
        <div className="brand">Meridian<small>{user?.email}</small></div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-primary" onClick={openNew}>+ New client</button>
          <button className="btn" onClick={signOut}>Sign out</button>
        </div>
      </div>

      {err && <div className="auth-err">{err}</div>}

      {loading ? (
        <div className="empty-state">Loading clients…</div>
      ) : clients.length === 0 ? (
        <div className="empty-state">
          <p>No clients yet.</p>
          <button className="btn btn-primary" onClick={openNew}>Create your first client</button>
        </div>
      ) : (
        <div className="client-grid">
          {clients.map((c) => {
            const editing = editingId === c.id;
            return (
              <div key={c.id} className="client-card" onClick={() => { if (!editing) router.push(`/plan/${c.id}`); }}>
                {editing ? (
                  <input
                    ref={editRef}
                    value={editName}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => commitRename(c)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); commitRename(c); }
                      else if (e.key === "Escape") { e.preventDefault(); setEditingId(null); }
                    }}
                    style={{ ...inputStyle, marginTop: 0, fontSize: 17, fontWeight: 600 }}
                  />
                ) : (
                  <h3>{c.display_name}</h3>
                )}
                <div className="meta">Updated {fmtDate(c.updated_at)}</div>
                <div className="row">
                  <button className="btn btn-ghost" onClick={(e) => startRename(c, e)}>Rename</button>
                  <button className="btn btn-ghost btn-danger" onClick={(e) => openDelete(c, e)}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal?.type === "new" && (
        <div style={overlay} onClick={() => !busy && setModal(null)}>
          <div style={box} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>New client</div>
            <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>You can rename this any time.</div>
            <input
              autoFocus
              value={modalName}
              onChange={(e) => setModalName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmNew(); else if (e.key === "Escape") setModal(null); }}
              style={inputStyle}
              placeholder="Client name"
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
              <button className="btn" onClick={() => setModal(null)} disabled={busy}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmNew} disabled={busy}>{busy ? "Creating…" : "Create"}</button>
            </div>
          </div>
        </div>
      )}

      {modal?.type === "delete" && (
        <div style={overlay} onClick={() => !busy && setModal(null)}>
          <div style={box} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Delete client</div>
            <div style={{ fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>
              Delete <b>{modal.client.display_name}</b> and all of its plans? This cannot be undone.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button className="btn" onClick={() => setModal(null)} disabled={busy}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDelete} disabled={busy}>{busy ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
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
