import { useCallback, useEffect, useState } from "react";
import { ADMIN, type AdminText } from "../i18n/admin";
import { clearAccount, saveAccount } from "../lib/account";
import { loadPrefs, savePrefs } from "../lib/storage";
import { LANGS } from "../lib/types";
import { humanError, type AdminApi, type Me } from "./api";
import { Browser } from "./Browser";
import { ImportView } from "./ImportView";
import { AdminLang } from "./lang";
import { ReviewQueue } from "./ReviewQueue";
import { SchoolsView } from "./SchoolsView";
import { QuestionEditor } from "./QuestionEditor";
import { UsersView } from "./UsersView";
import "./admin.css";

/** Что открыто: список вопросов, очередь проверки, конкретный вопрос или загрузка из Excel. */
export type AdminView =
  | { name: "browse" | "review" | "schools" | "users" }
  | { name: "edit"; id: string | null; topicId: string; back: "browse" | "review" }
  | { name: "import"; subjectId: string; grade: number };

export function AdminApp({ api }: { api: AdminApi }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined); // undefined — ещё проверяем
  const [failure, setFailure] = useState<unknown>(null);
  const [view, setView] = useState<AdminView>({ name: "browse" });
  // Пришли по ссылке из письма «Забыли пароль?» (/admin?reset): сначала — форма нового пароля.
  const [reset, setReset] = useState(() => new URLSearchParams(location.search).has("reset"));
  // Язык общий с сайтом ученика (bt-prefs): выбрал казахский на сайте — админка тоже на казахском.
  const [prefs, setPrefs] = useState(loadPrefs);
  const lang = prefs.lang;
  const t = ADMIN[lang];

  // Вошедший в админку виден и в шапке сайта (ник с меню «Кабинет / Шығу»).
  const refresh = useCallback(() => {
    api.me().then((m) => {
      setMe(m);
      if (m) saveAccount({ name: m.nickname || m.email.split("@")[0], role: m.role });
      else clearAccount();
    }, (e) => { setFailure(e); setMe(null); });
  }, [api]);

  useEffect(() => {
    refresh();
    return api.onAuthChange(refresh);
  }, [api, refresh]);

  useEffect(() => {
    document.body.classList.add("adm-body"); // компактные размеры админки (admin.css)
    // Своя иконка вкладки: золотая с карандашом, чтобы не путать с сайтом ученика.
    document.querySelector<HTMLLinkElement>("link[rel=icon]")?.setAttribute("href", "/favicon-admin.svg");
  }, []);

  useEffect(() => {
    document.title = t.title;
    document.documentElement.lang = lang;
  }, [lang, t]);

  const signOut = () => api.signOut().then(refresh);

  let body;
  if (me === undefined) body = <p className="loading">{t.loading}</p>;
  else if (me === null) body = <Login api={api} t={t} onDone={refresh} initialError={failure ? humanError(failure, t) : ""} />;
  else if (reset || me.mustChangePassword) {
    // По ссылке из письма или после входа с временным паролем (№80–81) — сначала новый пароль.
    body = <NewPassword api={api} t={t}
      onDone={() => { history.replaceState(null, "", "/admin"); setReset(false); refresh(); }} />;
  } else if (me.role === "student") {
    body = (
      <div className="adm-box">
        <p>{t.noAccess(me.email)}</p>
        <button type="button" className="btn ghost" onClick={signOut}>{t.logout}</button>
      </div>
    );
  } else if (view.name === "edit") {
    body = <QuestionEditor api={api} me={me} id={view.id} topicId={view.topicId}
      onClose={() => setView({ name: view.back })} />;
  } else if (view.name === "import") {
    body = <ImportView api={api} subjectId={view.subjectId} grade={view.grade} onClose={() => setView({ name: "browse" })} />;
  } else if (view.name === "schools" && me.role === "admin") {
    body = <SchoolsView api={api} />;
  } else if (view.name === "users" && me.role === "admin") {
    body = <UsersView api={api} me={me} />;
  } else if (view.name === "review") {
    body = <ReviewQueue api={api} onOpen={(id, topicId) => setView({ name: "edit", id, topicId, back: "review" })} />;
  } else {
    body = <Browser api={api} me={me}
      onOpen={(id, topicId) => setView({ name: "edit", id, topicId, back: "browse" })}
      onImport={(subjectId, grade) => setView({ name: "import", subjectId, grade })} />;
  }

  return (
    <AdminLang.Provider value={{ lang, t }}>
      <a className="skip" href="#main">{t.skip}</a>
      <header className="top"><div className="wrap">
        <a className="logo" href="/">
          <span className="logo-mark adm-mark">
            <svg width="18" height="18" viewBox="0 0 30 30" aria-hidden="true">
              <path d="M8.5 21.5l1-4.2 9.6-9.6a2.2 2.2 0 0 1 3.1 3.1l-9.6 9.6z" fill="none" stroke="#fff"
                strokeWidth="2.6" strokeLinejoin="round" />
              <path d="M17.2 9.6l3.2 3.2" stroke="#fff" strokeWidth="2.6" />
            </svg>
          </span>
          Білімтест <span className="adm-badge">{t.badge}</span>
        </a>
        {me && me.role !== "student" && (
          <nav className="adm-nav" aria-label={t.nav.label}>
            <button type="button" aria-pressed={!["review", "schools", "users"].includes(view.name)}
              onClick={() => setView({ name: "browse" })}>
              {t.nav.questions}
            </button>
            {me.role === "admin" && (
              <button type="button" aria-pressed={view.name === "review"} onClick={() => setView({ name: "review" })}>
                {t.nav.review}
              </button>
            )}
            {me.role === "admin" && (
              <button type="button" aria-pressed={view.name === "schools"} onClick={() => setView({ name: "schools" })}>
                {t.nav.schools}
              </button>
            )}
            {me.role === "admin" && (
              <button type="button" aria-pressed={view.name === "users"} onClick={() => setView({ name: "users" })}>
                {t.nav.users}
              </button>
            )}
          </nav>
        )}
        <div className="adm-user">
          <div className="langs" role="group" aria-label={t.langLabel}>
            {LANGS.map((l) => (
              <button key={l} type="button" aria-pressed={l === lang}
                onClick={() => { const p = { ...prefs, lang: l }; setPrefs(p); savePrefs(p); }}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          {me && (
            <>
              <span><span className="email">{me.email} · </span>{t.roles[me.role]}</span>
              <button type="button" className="btn ghost sm" onClick={signOut}>{t.logout}</button>
            </>
          )}
        </div>
      </div></header>
      <main id="main"><div className="wrap">{body}</div></main>
    </AdminLang.Provider>
  );
}

function Login({ api, t, onDone, initialError }: { api: AdminApi; t: AdminText; onDone: () => void; initialError: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false); // экран «Забыли пароль?»
  const [sentTo, setSentTo] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (forgot) {
        await api.resetPassword(email);
        setSentTo(email.trim());
      } else {
        await api.signIn(email, password);
        onDone();
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  // Ошибка хранится как есть и переводится при показе: смена языка переводит и её.
  const message = error ? humanError(error, t) : forgot ? "" : initialError;
  const toggle = () => { setForgot(!forgot); setError(null); setSentTo(""); };
  return (
    <form className="adm-box adm-login" onSubmit={submit}>
      <h2>{forgot ? t.login.resetTitle : t.login.title}</h2>
      <p className="lede">{forgot ? t.login.resetLede : t.login.lede}</p>
      <label>{t.login.email}<input type="email" autoComplete="username" required value={email}
        onChange={(e) => setEmail(e.target.value)} /></label>
      {!forgot && (
        <label>{t.login.password}<input type="password" autoComplete="current-password" required value={password}
          onChange={(e) => setPassword(e.target.value)} /></label>
      )}
      {message && <p className="error" role="alert">{message}</p>}
      {sentTo && <p role="status">{t.login.sent(sentTo)}</p>}
      <button type="submit" className="btn" disabled={busy}>
        {forgot ? (busy ? t.login.sending : t.login.sendLink) : (busy ? t.login.busy : t.login.submit)}
      </button>
      <button type="button" className="btn ghost sm" onClick={toggle}>{forgot ? t.login.back : t.login.forgot}</button>
    </form>
  );
}

/** Новый пароль после входа по ссылке из письма. */
function NewPassword({ api, t, onDone }: { api: AdminApi; t: AdminText; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== repeat) { setError(new Error(t.login.mismatch)); return; }
    setBusy(true);
    setError(null);
    try {
      await api.setPassword(password);
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="adm-box adm-login">
        <p role="status">{t.login.passwordSaved}</p>
        <button type="button" className="btn" onClick={onDone}>{t.login.toAdmin}</button>
      </div>
    );
  }
  return (
    <form className="adm-box adm-login" onSubmit={submit}>
      <h2>{t.login.newTitle}</h2>
      <p className="lede">{t.login.newLede}</p>
      <label>{t.login.newPassword}<input type="password" autoComplete="new-password" required minLength={6} value={password}
        onChange={(e) => setPassword(e.target.value)} /></label>
      <label>{t.login.repeat}<input type="password" autoComplete="new-password" required minLength={6} value={repeat}
        onChange={(e) => setRepeat(e.target.value)} /></label>
      {error != null && <p className="error" role="alert">{humanError(error, t)}</p>}
      <button type="submit" className="btn" disabled={busy}>{busy ? t.saving : t.login.savePassword}</button>
    </form>
  );
}
