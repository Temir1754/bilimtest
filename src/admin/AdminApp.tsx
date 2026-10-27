import { useCallback, useEffect, useState } from "react";
import { LogoMark, NickMenu } from "../components/NickMenu";
import { ADMIN, type AdminText } from "../i18n/admin";
import { cabinetPath, clearAccount, saveAccount } from "../lib/account";
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

export function AdminApp({ api, go = (p) => location.replace(p) }: {
  api: AdminApi;
  /** Переход на другую страницу (в тестах — заглушка). */
  go?: (path: string) => void;
}) {
  const [me, setMe] = useState<Me | null | undefined>(undefined); // undefined — ещё проверяем
  const [failure, setFailure] = useState<unknown>(null);
  const [view, setView] = useState<AdminView>({ name: "browse" });
  // Язык общий с сайтом ученика (bt-prefs): выбрал казахский на сайте — админка тоже на казахском.
  const [prefs, setPrefs] = useState(loadPrefs);
  const lang = prefs.lang;
  const t = ADMIN[lang];

  // Вошедший в админку виден и в шапке сайта (ник с меню).
  const nick = (m: Me) => m.nickname || m.email.split("@")[0];
  const refresh = useCallback(() => {
    api.me().then((m) => {
      setMe(m);
      if (m) saveAccount({ name: nick(m), role: m.role });
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

  // Вход один для всех — /login, в том же виде, что сайт (№84); после входа админа и учителя он вернёт сюда.
  useEffect(() => { if (me === null && !failure) go("/login"); }, [me, failure, go]);

  const signOut = () => api.signOut().then(refresh);

  let body;
  if (me === undefined) body = <p className="loading">{t.loading}</p>;
  else if (me === null) body = failure ? <p className="error" role="alert">{humanError(failure, t)}</p> : <p className="loading">{t.loading}</p>;
  else if (me.mustChangePassword) {
    // Вошёл с временным паролем (№80–81) — сначала новый пароль.
    body = <NewPassword api={api} t={t} onDone={refresh} />;
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
          {/* Шапка как на сайте, пометка «әкімші» — маленьким бейджем (№85) */}
          <LogoMark />
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
            <NickMenu name={nick(me)} label={t.menu.label} logout={t.logout} onLogout={signOut}
              items={[{ label: t.menu.site, href: "/" }, { label: t.menu.cabinet, href: cabinetPath(me.role) }]} />
          )}
        </div>
      </div></header>
      <main id="main"><div className="wrap">{body}</div></main>
    </AdminLang.Provider>
  );
}

/** Новый пароль вместо временного. */
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
