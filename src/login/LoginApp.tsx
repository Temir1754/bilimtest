// Экран /login: вход для всех по email или нику (DECISIONS.md №71); вошёл с временным паролем — сначала новый
// пароль (№80–81); «Забыли пароль?» — подсказка обратиться к администратору (писем без своего домена нет, №79).
// Макет — docs/design/mascot/login.png. Вкладка «Тіркелу» видна, только если регистрация открыта: в пилоте —
// упрощённая регистрация ученика (№83); учителям аккаунты создаёт админ (№80).
import { useEffect, useState } from "react";
import { LogoMark } from "../components/NickMenu";
import { AUTH, type AuthText } from "../i18n/auth";
import { cabinetPath, type Account } from "../lib/account";
import { loadPrefs, savePrefs } from "../lib/storage";
import { GRADES, LANGS } from "../lib/types";
import { authError, type AuthApi } from "./api";
import "./login.css";

interface Props {
  api: AuthApi;
  /** Переход после входа (в тестах — заглушка). */
  go?: (path: string) => void;
}

type Mode = { name: "login" } | { name: "forgot" } | { name: "change"; account: Account }
  | { name: "roles"; teacherNote?: boolean } | { name: "student" };

export function LoginApp({ api, go = (p) => location.assign(p) }: Props) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const t = AUTH[prefs.lang];
  const [mode, setMode] = useState<Mode>(() => (new URLSearchParams(location.search).has("signup")
    ? { name: "roles" } : { name: "login" }));
  const [open, setOpen] = useState({ teacher: false, student: false });

  useEffect(() => {
    document.title = t.title;
    document.documentElement.lang = prefs.lang;
  }, [t, prefs.lang]);
  // Нет связи с базой — считаем регистрацию закрытой: вход всё равно работает.
  useEffect(() => { api.signupOpen().then(setOpen, () => {}); }, [api]);

  const signupTab = open.student || open.teacher;
  const onSignup = mode.name === "roles" || mode.name === "student";
  const tabs = signupTab && mode.name !== "change" && (
    <div className="auth-tabs" role="tablist">
      <button type="button" role="tab" aria-selected={!onSignup} onClick={() => setMode({ name: "login" })}>{t.tabs.login}</button>
      <button type="button" role="tab" aria-selected={onSignup} onClick={() => setMode({ name: "roles" })}>{t.tabs.signup}</button>
    </div>
  );

  let card;
  if (onSignup && !signupTab) {
    card = <p className="lede">{t.signup.err.closed}</p>;
  } else if (mode.name === "roles") {
    card = (
      <div>
        <h1>{t.signup.who}</h1>
        <p className="lede">{t.signup.whoLede}</p>
        <div className="auth-roles">
          <button type="button" className="auth-role" onClick={() => setMode({ name: "roles", teacherNote: true })}>
            <img src="/mascot/barys-teacher.webp" alt="" width="290" height="240" />
            <b>{t.signup.teacher}</b><span>{t.signup.teacherText}</span>
          </button>
          <button type="button" className="auth-role" disabled={!open.student} onClick={() => setMode({ name: "student" })}>
            <img src="/mascot/barys-student.webp" alt="" width="240" height="256" />
            <b>{t.signup.student}</b><span>{t.signup.studentText}</span>
          </button>
        </div>
        {mode.teacherNote && <p className="note" role="status">{t.signup.teacherClosed}</p>}
      </div>
    );
  } else if (mode.name === "student") {
    card = <StudentSignupForm api={api} t={t} onBack={() => setMode({ name: "roles" })} onDone={() => go(cabinetPath("student"))} />;
  } else if (mode.name === "change") {
    card = <ChangePassword api={api} t={t} onDone={() => go(cabinetPath(mode.account.role))} />;
  } else if (mode.name === "forgot") {
    card = (
      <div>
        <h1>{t.forgot.title}</h1>
        <p className="lede">{t.forgot.teacher}</p>
        <p className="lede">{t.forgot.student}</p>
        <button type="button" className="link auth-link" onClick={() => setMode({ name: "login" })}>{t.forgot.back}</button>
      </div>
    );
  } else {
    card = <LoginForm api={api} t={t} onForgot={() => setMode({ name: "forgot" })}
      onDone={(account, mustChange) => (mustChange ? setMode({ name: "change", account }) : go(cabinetPath(account.role)))} />;
  }

  return (
    <>
      <header className="top"><div className="wrap">
        <a className="logo" href="/">
          <LogoMark />
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
        <section className="auth-card">{tabs}{card}</section>
        <a className="auth-back" href="/">{t.back}</a>
      </main>
    </>
  );
}

function LoginForm({ api, t, onForgot, onDone }: {
  api: AuthApi; t: AuthText; onForgot: () => void; onDone: (account: Account, mustChange: boolean) => void;
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
      const r = await api.signIn(id, password, remember);
      onDone(r.account, r.mustChange);
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

/** Упрощённая регистрация ученика (№83): ник, пароль, класс, согласие. После неё — сразу вход. */
function StudentSignupForm({ api, t, onBack, onDone }: { api: AuthApi; t: AuthText; onBack: () => void; onDone: () => void }) {
  const s = t.signup;
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [grade, setGrade] = useState<number | null>(null);
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // поле-ловушка
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const nick = nickname.trim().toLowerCase();
    const problem = !/^[a-z0-9_.]{3,20}$/.test(nick) ? s.err.badNick : password.length < 8 ? s.err.weak
      : password !== repeat ? s.err.mismatch : !grade ? s.err.grade : !consent ? s.err.consent : "";
    if (problem) { setError(new Error(problem)); return; }
    setBusy(true);
    setError(null);
    try {
      await api.signUpStudent({ nickname: nick, password, grade: grade!, consent, website });
      await api.signIn(nick, password, false);
      onDone();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <button type="button" className="link auth-backlink" onClick={onBack}>{s.back}</button>
      <h1>{s.title}</h1>
      <p className="lede">{s.lede}</p>
      <label className="auth-field">
        <UserIcon />
        <input required autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder={s.nick}
          aria-label={s.nick} aria-describedby="nick-hint" value={nickname} onChange={(e) => setNickname(e.target.value)} />
      </label>
      <p className="muted small" id="nick-hint">{s.nickHint}</p>
      <label className="auth-field">
        <LockIcon />
        <input type="password" required autoComplete="new-password" placeholder={s.password} aria-label={s.password}
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label className="auth-field">
        <LockIcon />
        <input type="password" required autoComplete="new-password" placeholder={s.repeat} aria-label={s.repeat}
          value={repeat} onChange={(e) => setRepeat(e.target.value)} />
      </label>
      <p className="muted small">{s.passwordHint}</p>
      <fieldset className="auth-grades">
        <legend>{s.grade}</legend>
        {GRADES.map((g) => (
          <button key={g} type="button" aria-pressed={grade === g} onClick={() => setGrade(g)}>{g}</button>
        ))}
      </fieldset>
      <label className="auth-trap" aria-hidden="true">Website
        <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </label>
      <label className="auth-check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>{s.consent} <a href="/privacy" target="_blank" rel="noopener">{s.policyLink}</a></span>
      </label>
      {error !== null && <p className="error" role="alert">{authError(error, t)}</p>}
      <button type="submit" className="btn auth-submit" disabled={busy}>{busy ? s.busy : s.submit}</button>
    </form>
  );
}

/** Новый пароль вместо временного — без этого дальше не пускаем. */
function ChangePassword({ api, t, onDone }: { api: AuthApi; t: AuthText; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError(new Error(t.change.short)); return; }
    if (password !== repeat) { setError(new Error(t.change.mismatch)); return; }
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(password);
      onDone();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h1>{t.change.title}</h1>
      <p className="lede">{t.change.lede}</p>
      <label className="auth-field">
        <LockIcon />
        <input type="password" autoComplete="new-password" required placeholder={t.change.password}
          aria-label={t.change.password} value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label className="auth-field">
        <LockIcon />
        <input type="password" autoComplete="new-password" required placeholder={t.change.repeat}
          aria-label={t.change.repeat} value={repeat} onChange={(e) => setRepeat(e.target.value)} />
      </label>
      {error !== null && <p className="error" role="alert">{authError(error, t)}</p>}
      <button type="submit" className="btn auth-submit" disabled={busy}>{busy ? t.change.busy : t.change.submit}</button>
    </form>
  );
}

const icon = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, className: "auth-icon" };
const MailIcon = () => <svg {...icon}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>;
const UserIcon = () => <svg {...icon}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
const LockIcon = () => <svg {...icon}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
const EyeIcon = ({ off }: { off: boolean }) => (
  <svg {...icon} className="">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
    {off && <path d="M4 4l16 16" />}
  </svg>
);
