"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/AuthProvider";

export default function LoginPage() {
  const { user, loading, signIn, signUp } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState("signin"); // or "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  async function submit() {
    setErr("");
    setInfo("");
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await signIn(email, password);
        if (error) throw error;
        router.replace("/");
      } else {
        const { error } = await signUp(email, password);
        if (error) throw error;
        setInfo("Account created. If email confirmation is on, check your inbox, then sign in.");
        setMode("signin");
      }
    } catch (e) {
      setErr(e.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const isSignin = mode === "signin";

  return (
    <div className="ml-wrap">
      <style>{`
        .ml-wrap{min-height:100vh;display:flex;background:var(--bg);}
        .ml-card{flex:1;display:flex;background:var(--card);overflow:hidden;}
        .ml-brand{flex:0 0 46%;max-width:560px;background:#102A43;padding:56px 52px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden;}
        .ml-brand-curve{position:absolute;left:0;bottom:0;width:100%;height:46%;opacity:.13;}
        .ml-logo{display:flex;align-items:center;gap:12px;position:relative;}
        .ml-logo-tile{width:40px;height:40px;border-radius:10px;background:#0F2233;display:inline-flex;align-items:center;justify-content:center;}
        .ml-logo-word{color:#fff;font-size:23px;font-weight:700;letter-spacing:-0.02em;}
        .ml-line{display:flex;align-items:center;gap:8px;margin-bottom:16px;}
        .ml-line .dot{width:5px;height:5px;border-radius:50%;background:#C8A951;}
        .ml-line .bar{width:34px;height:2px;background:#0CA5A5;border-radius:2px;}
        .ml-headline{color:#fff;font-size:25px;font-weight:700;line-height:1.3;letter-spacing:-0.02em;margin-bottom:24px;max-width:300px;position:relative;}
        .ml-tick{display:flex;align-items:center;gap:11px;color:#B8CBDD;font-size:14px;margin-bottom:14px;position:relative;}
        .ml-tick svg{flex:none;}
        .ml-copy{color:#5F7A92;font-size:12px;position:relative;}
        .ml-form{flex:1;padding:44px 40px;display:flex;align-items:center;justify-content:center;}
        .ml-form-inner{width:100%;max-width:320px;}
        .ml-h{font-size:22px;font-weight:700;color:var(--ink);letter-spacing:-0.01em;margin:0 0 4px;}
        .ml-sub{font-size:14px;color:var(--mid);margin:0 0 26px;}
        .ml-field{margin-bottom:18px;}
        .ml-field label{display:block;font-size:13px;font-weight:600;color:var(--mid);margin-bottom:7px;}
        .ml-field input{width:100%;height:42px;border:1px solid var(--border);border-radius:9px;padding:0 13px;font-family:inherit;font-size:14px;background:var(--card);color:var(--ink);transition:.12s;}
        .ml-field input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft);}
        .ml-btn{width:100%;height:44px;background:var(--accent-strong);color:#fff;border:none;border-radius:9px;font-family:inherit;font-weight:600;font-size:15px;cursor:pointer;transition:.12s;}
        .ml-btn:hover{filter:brightness(1.12);}
        .ml-btn:disabled{opacity:.6;cursor:default;}
        .ml-err{color:var(--red);font-size:12.5px;margin:0 0 14px;}
        .ml-info{color:var(--accent);font-size:12.5px;margin:0 0 14px;}
        .ml-switch{text-align:center;font-size:13.5px;color:var(--mid);margin-top:22px;}
        .ml-switch button{border:none;background:none;color:var(--accent);font-weight:600;cursor:pointer;font-family:inherit;font-size:13.5px;}
        @media(max-width:640px){.ml-brand{display:none;}.ml-form{padding:34px 28px;}}
      `}</style>

      <div className="ml-card">
        <div className="ml-brand">
          <svg className="ml-brand-curve" viewBox="0 0 400 200" preserveAspectRatio="none">
            <polyline points="0,150 50,135 100,140 150,110 200,95 250,70 300,80 350,45 400,30" fill="none" stroke="#0CA5A5" strokeWidth="3" />
          </svg>
          <div className="ml-logo">
            <span className="ml-logo-tile">
              <svg width="23" height="26" viewBox="0 0 48 54">
                <path d="M5 48 L5 12 L24 35 L43 12 L43 48" stroke="#0CA5A5" strokeWidth="6" fill="none" />
                <circle cx="24" cy="6" r="3.4" fill="#C8A951" />
              </svg>
            </span>
            <span className="ml-logo-word">Meridian</span>
          </div>

          <div>
            <div className="ml-line"><span className="dot" /><span className="bar" /></div>
            <div className="ml-headline">Cashflow planning, built for international advisers.</div>
            {[
              "Built for expat and cross-border clients",
              "Live, reactive forecasts in client meetings",
              "Built by an adviser, for advisers",
            ].map((t) => (
              <div className="ml-tick" key={t}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0CA5A5" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 L9 17 L4 12" />
                </svg>
                {t}
              </div>
            ))}
          </div>

          <div className="ml-copy">© 2026 Meridian</div>
        </div>

        <div className="ml-form">
          <div className="ml-form-inner">
            <h1 className="ml-h">{isSignin ? "Welcome back" : "Create your account"}</h1>
            <p className="ml-sub">{isSignin ? "Sign in to your workspace." : "Start planning in minutes."}</p>

            <div className="ml-field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@firm.com" autoComplete="email" />
            </div>
            <div className="ml-field">
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={isSignin ? "current-password" : "new-password"} onKeyDown={(e) => e.key === "Enter" && submit()} />
            </div>

            {err && <div className="ml-err">{err}</div>}
            {info && <div className="ml-info">{info}</div>}

            <button className="ml-btn" onClick={submit} disabled={busy}>
              {busy ? "…" : isSignin ? "Sign in" : "Create account"}
            </button>

            <div className="ml-switch">
              {isSignin ? "New to Meridian? " : "Already have an account? "}
              <button onClick={() => { setMode(isSignin ? "signup" : "signin"); setErr(""); setInfo(""); }}>
                {isSignin ? "Create an account" : "Sign in"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
