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

  // View / filter state
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("updated"); // "updated" | "name"
  const [view, setView] = useState("grid");     // "grid" | "list"
  const [menuId, setMenuId] = useState(null);    // card whose ⋯ menu is open

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

  // Remember the adviser's grid/list preference (UI state only, per-browser).
  useEffect(() => {
    try { const v = localStorage.getItem("meridian.dashView"); if (v === "grid" || v === "list") setView(v); } catch {}
  }, []);
  function chooseView(v) { setView(v); try { localStorage.setItem("meridian.dashView", v); } catch {} }

  // Close any open ⋯ menu on an outside click.
  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuId]);

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
    setMenuId(null);
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

  function openDelete(c, e) { e.stopPropagation(); setMenuId(null); setModal({ type: "delete", client: c }); }

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

  const q = query.trim().toLowerCase();
  const visible = clients
    .filter((c) => !q || c.display_name.toLowerCase().includes(q))
    .sort((a, b) =>
      sort === "name"
        ? a.display_name.localeCompare(b.display_name)
        : new Date(b.updated_at) - new Date(a.updated_at)
    );

  // Self-contained dialog styling so this doesn't depend on global CSS being present.
  const overlay = { position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 };
  const box = { background: "var(--card, #fff)", color: "var(--ink, #0f172a)", borderRadius: 14, padding: "22px 22px 18px", width: "min(420px, 100%)", boxShadow: "0 20px 60px rgba(0,0,0,.25)" };
  const inputStyle = { width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 15, border: "1px solid var(--border, #cbd5e1)", borderRadius: 9, marginTop: 10, outline: "none", background: "var(--card)", color: "var(--ink)" };

  const Menu = ({ c }) => (
    <div className="dz-menu" onClick={(e) => e.stopPropagation()}>
      <button onClick={(e) => startRename(c, e)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
        Rename
      </button>
      <button className="del" onClick={(e) => openDelete(c, e)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
        Delete
      </button>
    </div>
  );

  return (
    <div className="dz-shell">
      <style>{`
        .dz-shell{max-width:1180px;margin:0 auto;padding:26px 24px 70px;}
        .dz-top{display:flex;align-items:center;justify-content:space-between;padding-bottom:22px;margin-bottom:24px;border-bottom:1px solid var(--border);}
        .dz-brand{display:flex;align-items:center;gap:12px;}
        .dz-mark{width:38px;height:38px;border-radius:10px;background:#0F2233;display:inline-flex;align-items:center;justify-content:center;flex:none;}
        .dz-word{font-size:21px;font-weight:700;letter-spacing:-0.02em;color:var(--ink);line-height:1.1;}
        .dz-email{font-size:12.5px;color:var(--low);margin-top:1px;}
        .dz-actions{display:flex;gap:10px;}
        .dz-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:22px;}
        .dz-search{position:relative;flex:1;min-width:220px;}
        .dz-search svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--low);}
        .dz-search input{width:100%;box-sizing:border-box;height:40px;border:1px solid var(--border);border-radius:10px;padding:0 12px 0 36px;font-family:inherit;font-size:14px;background:var(--card);color:var(--ink);outline:none;transition:.12s;}
        .dz-search input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft);}
        .dz-select{height:40px;border:1px solid var(--border);border-radius:10px;padding:0 12px;font-family:inherit;font-size:14px;background:var(--card);color:var(--ink);cursor:pointer;outline:none;}
        .dz-select:focus{border-color:var(--accent);}
        .dz-count{font-size:13px;color:var(--low);font-variant-numeric:tabular-nums;}
        .dz-spacer{flex:1;}
        .dz-toggle{display:flex;border:1px solid var(--border);border-radius:10px;overflow:hidden;}
        .dz-toggle button{width:38px;height:40px;border:none;background:var(--card);color:var(--low);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;}
        .dz-toggle button + button{border-left:1px solid var(--border);}
        .dz-toggle button.on{background:var(--accent);color:#fff;}

        .dz-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:16px;}
        .dz-card{position:relative;background:var(--card);border:1px solid var(--border);border-radius:14px;padding:18px 18px 16px;cursor:pointer;transition:transform .14s ease,box-shadow .14s ease,border-color .14s ease;}
        .dz-card:hover{transform:translateY(-3px);border-color:var(--accent);box-shadow:0 10px 30px rgba(16,42,67,.10);}
        .dz-accent{position:absolute;left:0;top:16px;bottom:16px;width:3px;border-radius:0 3px 3px 0;background:var(--accent);}
        .dz-card h3{margin:0;font-size:16px;font-weight:700;letter-spacing:-0.01em;color:var(--ink);padding-right:26px;line-height:1.35;word-break:break-word;}
        .dz-meta{font-size:12px;color:var(--low);margin-top:8px;font-variant-numeric:tabular-nums;}
        .dz-kebab{position:absolute;top:14px;right:12px;width:28px;height:28px;border:none;background:transparent;color:var(--low);border-radius:7px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;opacity:0;transition:.12s;}
        .dz-card:hover .dz-kebab{opacity:1;}
        .dz-kebab:hover{background:var(--bg);color:var(--ink);}
        .dz-menu{position:absolute;top:40px;right:12px;background:var(--card);border:1px solid var(--border);border-radius:10px;box-shadow:0 12px 34px rgba(16,42,67,.16);padding:5px;z-index:5;min-width:130px;}
        .dz-menu button{display:flex;width:100%;align-items:center;gap:9px;background:none;border:none;color:var(--ink);font-family:inherit;font-size:13.5px;padding:8px 10px;border-radius:7px;cursor:pointer;text-align:left;}
        .dz-menu button:hover{background:var(--bg);}
        .dz-menu button.del{color:var(--red);}

        .dz-table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden;}
        .dz-table th{text-align:left;font-size:11.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--low);padding:13px 16px;cursor:pointer;white-space:nowrap;user-select:none;}
        .dz-table th:hover{color:var(--accent);}
        .dz-table td{padding:14px 16px;font-size:14px;border-top:1px solid var(--border);color:var(--ink);}
        .dz-table tr.row{cursor:pointer;}
        .dz-table tr.row:hover td{background:var(--bg);}
        .dz-rowname{font-weight:600;}
        .dz-rowmeta{color:var(--low);font-variant-numeric:tabular-nums;white-space:nowrap;}
        .dz-iconbtn{width:30px;height:30px;border:1px solid var(--border);background:var(--card);color:var(--low);border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;}
        .dz-iconbtn:hover{color:var(--ink);border-color:var(--accent);}
        .dz-iconbtn.del:hover{color:var(--red);border-color:var(--red);}

        .dz-empty{text-align:center;padding:80px 20px;color:var(--mid);}
        .dz-empty .ic{width:54px;height:54px;border-radius:14px;background:var(--bg);display:inline-flex;align-items:center;justify-content:center;color:var(--low);margin-bottom:16px;}
        .dz-empty p{margin:0 0 18px;font-size:15px;}
        @media(max-width:560px){.dz-email{display:none;}}
      `}</style>

      <header className="dz-top">
        <div className="dz-brand">
          <span className="dz-mark">
            <svg width="21" height="24" viewBox="0 0 48 54"><path d="M5 48 L5 12 L24 35 L43 12 L43 48" stroke="#0CA5A5" strokeWidth="6" fill="none" /><circle cx="24" cy="6" r="3.4" fill="#C8A951" /></svg>
          </span>
          <div>
            <div className="dz-word">Meridian</div>
            <div className="dz-email">{user?.email}</div>
          </div>
        </div>
        <div className="dz-actions">
          <button className="btn btn-primary" onClick={openNew}>+ New client</button>
          <button className="btn" onClick={signOut}>Sign out</button>
        </div>
      </header>

      {err && <div className="auth-err">{err}</div>}

      {loading ? (
        <div className="dz-empty">Loading clients…</div>
      ) : clients.length === 0 ? (
        <div className="dz-empty">
          <div className="ic">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          </div>
          <p>No clients yet.</p>
          <button className="btn btn-primary" onClick={openNew}>Create your first client</button>
        </div>
      ) : (
        <>
          <div className="dz-toolbar">
            <div className="dz-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search clients…" />
            </div>
            <select className="dz-select" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="updated">Last updated</option>
              <option value="name">Name A–Z</option>
            </select>
            <span className="dz-count">{visible.length} {visible.length === 1 ? "client" : "clients"}</span>
            <span className="dz-spacer" />
            <div className="dz-toggle">
              <button className={view === "grid" ? "on" : ""} onClick={() => chooseView("grid")} aria-label="Grid view" title="Grid view">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
              </button>
              <button className={view === "list" ? "on" : ""} onClick={() => chooseView("list")} aria-label="List view" title="List view">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
              </button>
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="dz-empty"><p>No clients match “{query}”.</p></div>
          ) : view === "grid" ? (
            <div className="dz-grid">
              {visible.map((c) => {
                const editing = editingId === c.id;
                return (
                  <div key={c.id} className="dz-card" onClick={() => { if (!editing) router.push(`/plan/${c.id}`); }}>
                    <span className="dz-accent" />
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
                        style={{ ...inputStyle, marginTop: 0, fontSize: 16, fontWeight: 700 }}
                      />
                    ) : (
                      <h3>{c.display_name}</h3>
                    )}
                    <div className="dz-meta">Updated {fmtDate(c.updated_at)}</div>
                    <button className="dz-kebab" onClick={(e) => { e.stopPropagation(); setMenuId(menuId === c.id ? null : c.id); }} aria-label="More actions">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
                    </button>
                    {menuId === c.id && <Menu c={c} />}
                  </div>
                );
              })}
            </div>
          ) : (
            <table className="dz-table">
              <thead>
                <tr>
                  <th onClick={() => setSort("name")}>Client</th>
                  <th onClick={() => setSort("updated")} style={{ width: 160 }}>Last updated</th>
                  <th style={{ width: 90, textAlign: "right" }}></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => {
                  const editing = editingId === c.id;
                  return (
                    <tr key={c.id} className="row" onClick={() => { if (!editing) router.push(`/plan/${c.id}`); }}>
                      <td>
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
                            style={{ ...inputStyle, marginTop: 0, fontWeight: 600 }}
                          />
                        ) : (
                          <span className="dz-rowname">{c.display_name}</span>
                        )}
                      </td>
                      <td className="dz-rowmeta">{fmtDate(c.updated_at)}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button className="dz-iconbtn" onClick={(e) => startRename(c, e)} aria-label="Rename" title="Rename" style={{ marginRight: 6 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                        </button>
                        <button className="dz-iconbtn del" onClick={(e) => openDelete(c, e)} aria-label="Delete" title="Delete">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
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
