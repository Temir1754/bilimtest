// Экран /login: вход для всех по email или нику (DECISIONS.md №71), «Забыли пароль?».
// Макет — docs/design/mascot/login.png. Вкладка «Тіркелу» появится в шаге 5 плана «Кіру»,
// когда откроется регистрация (№76).
import { useEffect, useState } from "react";
import { AUTH } from "../i18n/auth";
import { cabinetPath } from "../lib/account";
import { loadPrefs, savePrefs } from "../lib/storage";
import { LANGS } from "../lib/types";
import { authError, type AuthApi } from "./api";
import "./login.css";

interface Props {
  api: AuthApi;
  /** Переход после входа (в тестах — заглушка). */
  go?: (path: string) => void;
}

export function LoginApp({ api, go = (p) => location.assign(p) }: Props) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const t = AUTH[prefs.lang];
  const [mode, setMode] = useState<"login" | "reset">("login");

  useEffect(() => {
    document.title = t.title;
    document.documentElement.lang = prefs.lang;
  }, [t, prefs.lang]);

  return (
    <>
      <header className="top"><div className="wrap">
        <a className="logo" href="/">
          <span className="logo-mark">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M3 9.5l3.6 3.6L15 4.7" fill="none" stroke="var(--accent-ink)" strokeWidth="2.6"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          Білімтест
        </a>
        <div className="langs" role="group" aria-label="Language">
          {LANGS.map((l) => (
            <button key={l} type="button" aria-pressed={l === prefs.lang}
              onClick={() => { const p = { ...prefs, lang: l }; setPrefs(p); savePrefs(p); }}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div></header>

      <main id="main" className="auth wrap">
        <div className="auth-hero">
          <img src="/mascot/barys-wave.webp" alt="" width="530" height="500" />
          <p className="auth-slogan">{t.slogan}</p>
        </div>
        <section className="auth-card">
          {mode === "login"
            ? <LoginForm api={api} t={t} onForgot={() => setMode("reset")} onDone={(role) => go(cabinetPath(role))} />
            : <ResetForm api={api} t={t} onBack={() => setMode("login")} />}
        </section>
        <a className="auth-back" href="/">{t.back}</a>
      </main>
    </>
  );
}

type T = (typeof AUTH)["kk"];

function LoginForm({ api, t, onForgot, onDone }: {
  api: AuthApi; t: T; onForgot: () => void; onDone: (role: Parameters<typeof cabinetPath>[0]) => void;
}) {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false); // по умолчанию не отмечено: в школе общий компьютер
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await api.signIn(id, password, remember);
      onDone(me.role);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h1>{t.login.title}</h1>
      <p className="lede">{t.login.lede}</p>
      <label className="auth-field">
        <MailIcon />
        <input autoComplete="username" required placeholder={t.login.id} aria-label={t.login.id} value={id}
          autoCapitalize="none" spellCheck={false} onChange={(e) => setId(e.target.value)} />
      </label>
      <label className="auth-field">
        <LockIcon />
        <input type={show ? "text" : "password"} autoComplete="current-password" required placeholder={t.login.password}
          aria-label={t.login.password} value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="button" className="auth-eye" aria-label={show ? t.login.hide : t.login.show}
          onClick={() => setShow(!show)}><EyeIcon off={show} /></button>
      </label>
      <label className="auth-check" title={t.login.rememberHint}>
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        {t.login.remember}
      </label>
      {error !== null && <p className="error" role="alert">{authError(error, t)}</p>}
      <button type="submit" className="btn auth-submit" disabled={busy}>{busy ? t.login.busy : t.login.submit}</button>
      <button type="button" className="link auth-link" onClick={onForgot}>{t.login.forgot}</button>
    </form>
  );
}

function ResetForm({ api, t, onBack }: { api: AuthApi; t: T; onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword(email);
      setSentTo(email.trim());
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h1>{t.reset.title}</h1>
      <p className="lede">{t.reset.lede}</p>
      <label className="auth-field">
        <MailIcon />
        <input type="email" autoComplete="email" required placeholder={t.reset.email} aria-label={t.reset.email}
          value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <p className="muted small">{t.reset.student}</p>
      {error !== null && <p className="error" role="alert">{authError(error, t)}</p>}
      {sentTo && <p className="note" role="status">{t.reset.sent(sentTo)}</p>}
      <button type="submit" className="btn auth-submit" disabled={busy}>{busy ? t.reset.sending : t.reset.send}</button>
      <button type="button" className="link auth-link" onClick={onBack}>{t.reset.back}</button>
    </form>
  );
}

const icon = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, className: "auth-icon" };
const MailIcon = () => <svg {...icon}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>;
const LockIcon = () => <svg {...icon}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
const EyeIcon = ({ off }: { off: boolean }) => (
  <svg {...icon} className="">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
    {off && <path d="M4 4l16 16" />}
  </svg>
);
