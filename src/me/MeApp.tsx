// Кабинет ученика /me (план «Кіру», шаг 7): класс, ник, пароль, удаление аккаунта.
// Не вошёл — на /login; учитель и админ — в /admin (их кабинет пока там).
// Смена пароля и удаление — только с текущим паролем: в школе компьютер общий.
import { useCallback, useEffect, useState } from "react";
import { LogoMark, NickMenu } from "../components/NickMenu";
import { ME, type MeText } from "../i18n/me";
import { pendingJoin, setPendingJoin } from "../lib/account";
import { loadPrefs, savePrefs, type Prefs } from "../lib/storage";
import { GRADES, LANGS, type Lang } from "../lib/types";
import { reportText, weekStats } from "./report";
import { meError, type MeApi, type MyClass, type MyRun, type Profile } from "./api";
import "./me.css";

interface Props {
  api: MeApi;
  /** Переход на другую страницу (в тестах — заглушка). */
  go?: (path: string) => void;
}

export function MeApp({ api, go = (p) => location.assign(p) }: Props) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const t = ME[prefs.lang];
  const [me, setMe] = useState<Profile | null | undefined>(undefined); // undefined — ещё проверяем
  const [failure, setFailure] = useState<unknown>(null);

  useEffect(() => {
    document.title = t.title;
    document.documentElement.lang = prefs.lang;
  }, [t, prefs.lang]);
  useEffect(() => {
    // Ссылка учителя /me?join=КОД: код запоминается, даже если сначала нужно войти (№102).
    const code = new URLSearchParams(location.search).get("join");
    if (code) { setPendingJoin(code.trim().toUpperCase()); history.replaceState(null, "", "/me"); }
    api.load().then(setMe, (e) => { setFailure(e); setMe(null); });
  }, [api]);
  useEffect(() => {
    if (me === null && !failure) go("/login");
    else if (me && me.role !== "student") go("/admin");
  }, [me, failure, go]);

  const updatePrefs = (p: Partial<Prefs>) => setPrefs((old) => { const next = { ...old, ...p }; savePrefs(next); return next; });

  let body;
  if (failure) body = <p className="error" role="alert">{meError(failure, t)}</p>;
  else if (!me || me.role !== "student") body = <p className="loading">{t.loading}</p>;
  else {
    body = (
      <>
        <h1>{t.heading}</h1>
        <p className="lede">{t.hello(me.nickname)}</p>
        <RunsCard api={api} t={t} lang={prefs.lang} nickname={me.nickname} />
        <ClassesCard api={api} t={t} lang={prefs.lang} />
        <GradeCard api={api} t={t} grade={me.grade}
          onSaved={(grade) => { setMe({ ...me, grade }); updatePrefs({ grade }); }} />
        <NickCard api={api} t={t} nickname={me.nickname} onSaved={(nickname) => setMe({ ...me, nickname })} />
        <PasswordCard api={api} t={t} nickname={me.nickname} />
        <DeleteCard api={api} t={t} nickname={me.nickname} onDone={() => go("/")} />
      </>
    );
  }

  return (
    <>
      <a className="skip" href="#main">{t.skip}</a>
      <header className="top"><div className="wrap">
        <a className="logo" href="/"><LogoMark />Білімтест</a>
        <div className="top-right">
          <div className="langs" role="group" aria-label="Language">
            {LANGS.map((l) => (
              <button key={l} type="button" aria-pressed={l === prefs.lang} onClick={() => updatePrefs({ lang: l })}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          {me && <NickMenu name={me.nickname} label={t.menu} items={[{ label: t.toSite, href: "/" }]} logout={t.logout}
            onLogout={() => api.signOut().finally(() => go("/"))} />}
        </div>
      </div></header>
      <main id="main" className="me wrap">{body}</main>
    </>
  );
}

/** Общее для карточек: занято, ошибка, «Сохранено». */
function useAction(t: MeText) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  async function run(f: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await f();
      setDone(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const status = error !== null ? <p className="error" role="alert">{meError(error, t)}</p>
    : done ? <p className="me-ok" role="status">{t.saved}</p> : null;
  return { busy, run, status, fail: (m: string) => { setDone(false); setError(new Error(m)); } };
}

/** Класс: нажал — сразу сохранено; на главной откроется этот класс. */
/** «Нәтижелерім»: последние тесты из аккаунта (№104). */
function RunsCard({ api, t, lang, nickname }: { api: MeApi; t: MeText; lang: Lang; nickname: string }) {
  const [runs, setRuns] = useState<MyRun[] | null>(null);
  useEffect(() => { api.runs(lang).then(setRuns, () => setRuns([])); }, [api, lang]);
  if (!runs) return null;
  const date = (s: string) => new Date(s).toLocaleDateString(lang === "en" ? "en-GB" : lang === "ru" ? "ru-RU" : "kk-KZ");
  const week = weekStats(runs);
  const text = week ? reportText(nickname, week, t, location.origin) : "";
  return (
    <section className="me-card" aria-labelledby="me-runs">
      <h2 id="me-runs">{t.runs.title}</h2>
      {/* Отчёт родителю за неделю (№106): ученик отправляет сам — WhatsApp или Telegram */}
      {week ? (
        <div className="me-report">
          <p className="muted">{t.report.lede}</p>
          <pre className="me-report-text">{text}</pre>
          <p className="me-row">
            <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener">{t.report.whatsapp}</a>
            <a className="btn ghost" href={`https://t.me/share/url?url=${encodeURIComponent(location.origin)}&text=${encodeURIComponent(text)}`}
              target="_blank" rel="noopener">{t.report.telegram}</a>
          </p>
        </div>
      ) : runs.length > 0 && <p className="muted">{t.report.none}</p>}
      {runs.length === 0 ? <p className="muted">{t.runs.none}</p> : (
        <ul className="me-runs">
          {runs.slice(0, 10).map((r, i) => {
            const pct = Math.round((r.score / r.total) * 100);
            return (
              <li key={i}>
                <span><b>{r.subject}</b> · {r.topic || t.runs.mixed}<br /><small className="muted">{date(r.finished_at)}</small></span>
                <span className={pct >= 90 ? "lvl-ok" : pct >= 60 ? "lvl-mid" : "lvl-low"}>{r.score}/{r.total} · {pct}%</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** «Сыныптарым»: классы ученика и вход по коду учителя (№102). */
function ClassesCard({ api, t, lang }: { api: MeApi; t: MeText; lang: Lang }) {
  const a = useAction(t);
  const [list, setList] = useState<MyClass[] | null>(null);
  const [code, setCode] = useState(pendingJoin);
  const [name, setName] = useState("");
  const load = useCallback(() => api.classes(lang).then(setList, () => setList([])), [api, lang]);
  useEffect(() => { load(); }, [load]);
  function join(e: React.FormEvent) {
    e.preventDefault();
    a.run(async () => { await api.joinClass(code.trim(), name.trim()); setPendingJoin(""); setCode(""); await load(); });
  }
  return (
    <section className="me-card" aria-labelledby="me-classes">
      <h2 id="me-classes">{t.classes.title}</h2>
      {list && list.length > 0 && (
        <ul className="me-classes">
          {list.map((c) => (
            <li key={c.id}>
              <span><b>{c.subject}</b> · {t.classes.name(c.grade, c.letter)}{c.teacher && <span className="muted"> · {c.teacher}</span>}</span>
              <button type="button" className="link" disabled={a.busy}
                onClick={() => confirm(t.classes.confirmLeave) && a.run(async () => { await api.leaveClass(c.id); await load(); })}>{t.classes.leave}</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={join} className="me-join">
        <p className="muted">{t.classes.lede}</p>
        <label>{t.classes.code}
          <input value={code} required maxLength={6} autoCapitalize="characters" autoComplete="off"
            onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </label>
        <label>{t.classes.name_}
          <input value={name} maxLength={60} placeholder={t.classes.namePh} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className="btn" disabled={a.busy || code.trim().length !== 6}>{t.classes.join}</button>
      </form>
      {a.status}
    </section>
  );
}

function GradeCard({ api, t, grade, onSaved }: { api: MeApi; t: MeText; grade: number | null; onSaved: (g: number) => void }) {
  const a = useAction(t);
  return (
    <section className="me-card" aria-labelledby="me-grade">
      <h2 id="me-grade">{t.grade.title}</h2>
      <p className="muted">{t.grade.lede}</p>
      <div className="me-grades" role="group" aria-labelledby="me-grade">
        {GRADES.map((g) => (
          <button key={g} type="button" aria-pressed={grade === g} disabled={a.busy}
            onClick={() => a.run(async () => { await api.setGrade(g); onSaved(g); })}>{g}</button>
        ))}
      </div>
      {a.status}
    </section>
  );
}

function NickCard({ api, t, nickname, onSaved }: { api: MeApi; t: MeText; nickname: string; onSaved: (n: string) => void }) {
  const a = useAction(t);
  const [value, setValue] = useState(nickname);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const nick = value.trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,20}$/.test(nick)) return a.fail(t.err.badNick);
    a.run(async () => { await api.changeNickname(nick); setValue(nick); onSaved(nick); });
  }
  return (
    <form className="me-card" onSubmit={submit} aria-labelledby="me-nick">
      <h2 id="me-nick">{t.nick.title}</h2>
      <p className="muted">{t.nick.lede}</p>
      <label>{t.nick.label}
        <input required autoComplete="username" autoCapitalize="none" spellCheck={false} value={value}
          aria-describedby="me-nick-hint" onChange={(e) => setValue(e.target.value)} />
      </label>
      <p className="muted small" id="me-nick-hint">{t.nick.hint}</p>
      {a.status}
      <button type="submit" className="btn" disabled={a.busy || value.trim().toLowerCase() === nickname}>{t.nick.save}</button>
    </form>
  );
}

function PasswordCard({ api, t, nickname }: { api: MeApi; t: MeText; nickname: string }) {
  const a = useAction(t);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) return a.fail(t.err.weak);
    if (next !== repeat) return a.fail(t.err.mismatch);
    a.run(async () => {
      await api.checkPassword(nickname, current);
      await api.changePassword(next);
      setCurrent(""); setNext(""); setRepeat("");
    });
  }
  return (
    <form className="me-card" onSubmit={submit} aria-labelledby="me-pass">
      <h2 id="me-pass">{t.password.title}</h2>
      <input type="text" autoComplete="username" value={nickname} readOnly hidden />
      <label>{t.password.current}
        <input type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label>{t.password.next}
        <input type="password" required autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <label>{t.password.repeat}
        <input type="password" required autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
      </label>
      {a.status}
      <button type="submit" className="btn" disabled={a.busy}>{t.password.save}</button>
    </form>
  );
}

function DeleteCard({ api, t, nickname, onDone }: { api: MeApi; t: MeText; nickname: string; onDone: () => void }) {
  const a = useAction(t);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  function submit(e: React.FormEvent) {
    e.preventDefault();
    a.run(async () => {
      await api.checkPassword(nickname, password);
      await api.deleteAccount();
      onDone();
    });
  }
  return (
    <form className="me-card me-danger" onSubmit={submit} aria-labelledby="me-del">
      <h2 id="me-del">{t.del.title}</h2>
      <p className="muted">{t.del.lede}</p>
      {!open ? (
        <button type="button" className="btn ghost danger" onClick={() => setOpen(true)}>{t.del.open}</button>
      ) : (
        <>
          <input type="text" autoComplete="username" value={nickname} readOnly hidden />
          <label>{t.del.password}
            <input type="password" required autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} />
          </label>
          {a.status}
          <div className="me-row">
            <button type="submit" className="btn danger" disabled={a.busy}>{t.del.confirm}</button>
            <button type="button" className="btn ghost" onClick={() => { setOpen(false); setPassword(""); }}>{t.del.cancel}</button>
          </div>
        </>
      )}
    </form>
  );
}
