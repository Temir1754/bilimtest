import { useCallback, useEffect, useState } from "react";
import { LogoMark, NickMenu } from "../components/NickMenu";
import { ADMIN, type AdminText } from "../i18n/admin";
import { cabinetPath, clearAccount, saveAccount } from "../lib/account";
import { loadPrefs, savePrefs } from "../lib/storage";
import { LANGS } from "../lib/types";
import { humanError, type AdminApi, type Me } from "./api";
import { Browser } from "./Browser";
import { ClassesView, ClassPage, StudentPage } from "./ClassesView";
import { HelpView } from "./HelpView";
import { ImportView } from "./ImportView";
import { MemoView } from "./MemoView";
import { AdminLang } from "./lang";
import { ReviewQueue } from "./ReviewQueue";
import { navTab, parsePath, toPath, type AdminView } from "./route";
import { SchoolsView } from "./SchoolsView";
import { setStartHidden, StartGuide, startHidden } from "./StartGuide";
import { QuestionEditor } from "./QuestionEditor";
import { Go, GradeStep, MyQuestions, TopicQuestions, TopicsStep, TranslateList, type Nav } from "./Steps";
import { UsersView } from "./UsersView";
import "./admin.css";

export function AdminApp({ api, go = (p) => location.replace(p) }: {
  api: AdminApi;
  /** Переход на другую страницу (в тестах — заглушка). */
  go?: (path: string) => void;
}) {
  const [me, setMe] = useState<Me | null | undefined>(undefined); // undefined — ещё проверяем
  const [failure, setFailure] = useState<unknown>(null);
  // Экран — по адресу (№87): работает кнопка «Назад» браузера.
  const [view, setView] = useState<AdminView>(() => parsePath(location.pathname));
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

  const nav: Nav = useCallback((v, replace = false) => {
    const path = toPath(v);
    if (path !== location.pathname) history[replace ? "replaceState" : "pushState"](null, "", path);
    setView(v);
    window.scrollTo?.(0, 0);
  }, []);
  useEffect(() => {
    const back = () => setView(parsePath(location.pathname));
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  // В «Барлық сұрақтарды іздеу» вопрос и загрузка открываются по id предмета — адрес строится по его коду.
  const openExcel = (subjectId: string, grade: number) =>
    api.subjects().then((list) => { const x = list.find((y) => y.id === subjectId); if (x) nav({ name: "excel", slug: x.slug, grade }); });
  const tab = navTab(view);
  // «Алғашқы қадамдар» (№113): учителю над экранами вкладок, пока не всё сделано и он не скрыл блок.
  const [hideStart, setHideStart] = useState(false);
  useEffect(() => { if (me) setHideStart(startHidden(me.id)); }, [me]);
  const showStart = me?.role === "teacher" && !me.mustChangePassword && !hideStart &&
    ["grade", "topics", "my", "classes", "class"].includes(view.name);

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
  } else if (view.name === "edit" || view.name === "new") {
    body = view.name === "edit"
      ? <QuestionEditor key={view.id} api={api} me={me} id={view.id} topicId="" nav={nav} />
      : <QuestionEditor key={`new-${view.topicId}`} api={api} me={me} id={null} topicId={view.topicId} nav={nav} />;
  } else if (view.name === "excel") {
    body = <ExcelRoute api={api} slug={view.slug} grade={view.grade} canPublish={me.role === "admin" || me.trusted === true} onClose={() => nav({ name: "topics", slug: view.slug, grade: view.grade })} />;
  } else if (view.name === "topics") {
    body = <TopicsStep key={`${view.slug}-${view.grade}`} api={api} me={me} slug={view.slug} grade={view.grade} nav={nav} />;
  } else if (view.name === "topic") {
    body = <TopicQuestions key={view.topicId} api={api} me={me} topicId={view.topicId} nav={nav} />;
  } else if (view.name === "classes") {
    body = <ClassesView api={api} nav={nav} />;
  } else if (view.name === "class") {
    body = <ClassPage key={view.id} api={api} id={view.id} nav={nav} />;
  } else if (view.name === "student") {
    body = <StudentPage key={view.id} api={api} classId={view.classId} id={view.id} nav={nav} />;
  } else if (view.name === "memo") {
    body = <MemoView key={view.id} api={api} id={view.id} nav={nav} />;
  } else if (view.name === "help") {
    body = <HelpView api={api} id={view.id} nav={nav} />;
  } else if (view.name === "my") {
    body = <MyQuestions api={api} me={me} nav={nav} />;
  } else if (view.name === "translate") {
    body = <TranslateList api={api} me={me} nav={nav} />;
  } else if (view.name === "schools" && me.role === "admin") {
    body = <SchoolsView api={api} />;
  } else if (view.name === "author" && me.role === "admin") {
    body = <MyQuestions key={view.id} api={api} me={me} nav={nav} authorId={view.id} />;
  } else if (view.name === "users" && me.role === "admin") {
    body = <UsersView api={api} me={me} nav={nav} />;
  } else if (view.name === "review" && me.role === "admin") {
    body = <ReviewQueue api={api} me={me} nav={nav} />;
  } else if (view.name === "search") {
    body = <Browser api={api} me={me}
      onOpen={(id, topicId) => nav(id ? { name: "edit", id } : { name: "new", topicId })}
      onImport={openExcel} />;
  } else {
    body = <GradeStep api={api} me={me} nav={nav} />;
  }

  return (
    <AdminLang.Provider value={{ lang, t }}>
      <a className="skip" href="#main">{t.skip}</a>
      <header className="top"><div className="wrap">
        <a className="logo" href="/">
          {/* Шапка как на сайте, пометка «әкімші» — маленьким бейджем (№85) */}
          <LogoMark />
          Білімтест <span className="adm-badge">{me?.role === "teacher" ? t.badgeTeacher : t.badge}</span>
        </a>
        {me && me.role !== "student" && (
          <nav className="adm-nav" aria-label={t.nav.label}>
            {/* Учитель: «Сұрақтар», «Менің сұрақтарым», «Сыныптарым» и «Нұсқаулық»; админ: ещё «Тексеруде», «Мектептер», «Пайдаланушылар» */}
            {(me.role === "admin" ? ["questions", "review", "schools", "users"] as const : ["questions", "my", "classes", "help"] as const).map((k) => (
              <Go key={k} to={k === "questions" ? { name: "grade" } : { name: k }} nav={nav}
                className={tab === k ? "on" : undefined}>{t.nav[k]}</Go>
            ))}
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
              items={[{ label: t.menu.site, href: "/" }, { label: t.menu.cabinet, href: cabinetPath(me.role) },
                ...(me.role === "teacher" && hideStart
                  ? [{ label: t.start.reopen, onClick: () => { setStartHidden(me.id, false); setHideStart(false); } }] : [])]} />
          )}
        </div>
      </div></header>
      <main id="main"><div className="wrap">
        {showStart && me && <StartGuide key={view.name} api={api} me={me} nav={nav} onHide={() => setHideStart(true)} />}
        {body}
      </div></main>
    </AdminLang.Provider>
  );
}

/** Загрузка из Excel: в адресе код предмета, экрану загрузки нужен его id. */
function ExcelRoute({ api, slug, grade, canPublish, onClose }:
  { api: AdminApi; slug: string; grade: number; canPublish: boolean; onClose: () => void }) {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => { api.subjects().then((list) => setId(list.find((x) => x.slug === slug)?.id ?? null)); }, [api, slug]);
  return id ? <ImportView api={api} subjectId={id} grade={grade} canPublish={canPublish} onClose={onClose} /> : null;
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
