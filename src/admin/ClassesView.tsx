// «Сыныптарым» — классы учителя (DECISIONS.md №102): создать класс, код и ссылка для учеников, отчёт по классу.
// Задание в первой версии — ссылка на предмет или тему сайта: учитель отправляет её в группу класса,
// а все тесты ученика по предмету класса попадают в отчёт (№57).
import { useCallback, useEffect, useState } from "react";
import { GRADES } from "../lib/types";
import { humanError, type AdminApi, type Assignment, type ClassMatrix, type ClassReport, type ClassRow, type StudentReport, type SubjectRow } from "./api";
import { classSheets, download } from "./excel";
import { HelpLink } from "./HelpLink";
import { nm, useT } from "./lang";
import { Go, type Nav } from "./Steps";

export const joinLink = (code: string) => `${location.origin}/me?join=${code}`;

/** Цвет уровня (№58, №62): 80+ — знает, 50–79 — частично, меньше — не знает; мало ответов — серый. */
export const lvl = (pct: number | null, n = Infinity, min = 5) =>
  pct === null || n < min ? "lvl-none" : pct >= 80 ? "lvl-ok" : pct >= 50 ? "lvl-mid" : "lvl-low";

/** Ближайшая пятница (если сегодня пятница — через неделю), «ГГГГ-ММ-ДД» по местному времени. */
export function nextFriday(now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + (((5 - d.getDay() + 7) % 7) || 7));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** «Тапсырмалар» (№110): дать тему со сроком, кто выполнил. Ссылка для учеников — /t/id темы. */
function Assignments({ api, classId, subjectId, grade }: { api: AdminApi; classId: string; subjectId: string; grade: number }) {
  const { lang, t } = useT();
  const c = t.cls;
  const [list, setList] = useState<Assignment[] | null>(null);
  const [topics, setTopics] = useState<{ id: string; title: string; open: boolean }[]>([]);
  const [topicId, setTopicId] = useState("");
  const [due, setDue] = useState(nextFriday);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(() => api.assignments(classId).then(setList, setError), [api, classId]);
  useEffect(() => {
    load();
    Promise.all([api.topics(subjectId, grade), api.topicCounts(grade, lang), api.topicMin()]).then(([tps, counts, min]) => {
      const ready = new Map(counts.map((x) => [x.topic_id, x.ready]));
      const rows = tps.slice().sort((a, b) => a.sort_order - b.sort_order)
        .map((x) => ({ id: x.id, title: nm(x, "title", lang), open: (ready.get(x.id) ?? 0) >= min }));
      setTopics(rows);
      setTopicId((cur) => cur || rows.find((x) => x.open)?.id || "");
    }, setError);
  }, [api, classId, subjectId, grade, lang, load]);

  async function give(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try { await api.createAssignment(classId, topicId, due); await load(); } catch (err) { setError(err); }
  }
  async function remove(id: string) {
    if (!confirm(c.confirmDelTask)) return;
    try { await api.deleteAssignment(id); await load(); } catch (err) { setError(err); }
  }
  const date = (s: string) => new Date(s).toLocaleDateString();

  return (
    <section className="st-card">
      <div className="help-head"><h2>{c.tasksTitle}</h2><HelpLink id="task" /></div>
      {topics.length > 0 && !topics.some((x) => x.open) && <p className="muted">{t.hl.noOpenTopic} <HelpLink id="status" /></p>}
      <form className="adm-row grow" onSubmit={give}>
        <label>{c.taskTopic}
          <select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
            {topics.map((x) => <option key={x.id} value={x.id} disabled={!x.open}>{x.title}{x.open ? "" : ` — ${c.closed}`}</option>)}
          </select>
        </label>
        <label>{c.taskDue}<input type="date" value={due} required onChange={(e) => setDue(e.target.value)} /></label>
        <button type="submit" className="btn" disabled={!topicId}>{c.give}</button>
      </form>
      {error !== null && <p className="error" role="alert">{humanError(error, t)}</p>}
      {list && list.length > 0 && (
        <ul className="tasks">
          {list.map((a) => {
            const done = a.students.filter((s) => s.percent !== null).length;
            const link = `${location.origin}/t/${a.topic_id}`;
            return (
              <li key={a.id}>
                <div className="task-head">
                  <b>{nm(a, "title", lang)}</b>
                  <span className={new Date(a.due_at) < new Date() ? "lvl-low" : "muted"}>{c.until(date(a.due_at))}</span>
                  <button type="button" className="link" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>
                    {c.doneOf(done, a.students.length)}</button>
                  <Copy text={link} label={c.copyLink} />
                  <button type="button" className="link danger" onClick={() => remove(a.id)}>{t.del}</button>
                </div>
                {open === a.id && (
                  <ul className="task-students">{a.students.map((s) => (
                    <li key={s.id}><span>{s.name}</span>
                      <span className={s.percent === null ? "muted" : lvl(s.percent)}>{s.percent === null ? c.notDone : `✓ ${s.percent}%`}</span></li>
                  ))}</ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** «Ученики × темы»: строки — ученики, столбцы — темы, в клетке — процент по последним 20 ответам. */
function Matrix({ api, id, grade, nav }: { api: AdminApi; id: string; grade: number; nav: Nav }) {
  const { lang, t } = useT();
  const c = t.cls;
  const [m, setM] = useState<ClassMatrix | null>(null);
  useEffect(() => { api.classMatrix(id).then(setM, () => setM(null)); }, [api, id]);
  if (!m || m.students.length === 0 || m.topics.length === 0) return null;
  const cell = (s: string, tp: string) => m.cells.find((x) => x.s === s && x.t === tp);
  return (
    <section>
      <div className="help-head"><h2>{c.matrixTitle}</h2><HelpLink id="task" /></div>
      <p className="muted">{c.matrixHint(m.min_answers)}</p>
      <div className="mx-wrap"><table className="mx">
        <thead><tr><th />{m.topics.map((tp) => (
          <th key={tp.id} title={nm(tp, "title", lang)}><span>{nm(tp, "title", lang)}{tp.grade !== grade ? ` · ${c.otherGrade(tp.grade)}` : ""}</span></th>
        ))}</tr></thead>
        <tbody>{m.students.map((s) => (
          <tr key={s.id}>
            <th><Go to={{ name: "student", classId: id, id: s.id }} nav={nav}>{s.name}</Go>
              {s.inactive && <small className="lvl-low"> · {c.inactive}</small>}</th>
            {m.topics.map((tp) => {
              const x = cell(s.id, tp.id);
              return <td key={tp.id} className={x ? lvl(x.pct, x.n, m.min_answers) : ""} title={x ? c.answersN(x.n) : ""}>
                {x ? (x.n < m.min_answers ? "·" : `${x.pct}`) : ""}</td>;
            })}
          </tr>
        ))}</tbody>
      </table></div>
    </section>
  );
}

/** Страница ученика (№107): тесты, средний процент, по неделям, уровни тем, вопросы с ошибками. */
export function StudentPage({ api, classId, id, nav }: { api: AdminApi; classId: string; id: string; nav: Nav }) {
  const { lang, t } = useT();
  const c = t.cls;
  const [r, setR] = useState<StudentReport | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { api.studentReport(classId, id).then(setR, setError); }, [api, classId, id]);
  if (!r) return <div className="st-page">{error !== null ? <p className="error" role="alert">{humanError(error, t)}</p> : <p className="loading">{t.loading}</p>}</div>;
  const max = Math.max(1, ...r.weeks.map((w) => w.tests));
  return (
    <div className="st-page">
      <Go to={{ name: "class", id: classId }} nav={nav} className="st-back">← {c.backToClass}</Go>
      <h1>{r.name}</h1>
      <div className="us-counts">
        <span><b>{r.runs}</b>{c.runs}</span>
        <span className={lvl(r.percent)}><b>{r.percent === null ? "—" : `${r.percent}%`}</b>{c.percent}</span>
      </div>
      {r.weeks.length > 0 && (
        <section>
          <h2>{c.weeksTitle}</h2>
          <ul className="wk">{r.weeks.map((w) => (
            <li key={w.week}>
              <span className="muted">{new Date(w.week).toLocaleDateString()}</span>
              <i style={{ width: `${(w.tests / max) * 100}%` }} className={lvl(w.percent)} />
              <span>{c.weekLine(w.tests, w.percent)}</span>
            </li>
          ))}</ul>
        </section>
      )}
      {r.topics.length > 0 && (
        <section>
          <h2>{c.levelsTitle}</h2>
          <ul className="cls-topics">{r.topics.map((tp) => (
            <li key={tp.id}>
              <span>{nm(tp, "title", lang)}</span>
              <span className={lvl(tp.pct, tp.n)}>{tp.n < 5 ? c.fewData : `${tp.pct}%`}</span>
              <span className="muted">{c.answersN(tp.n)}</span>
            </li>
          ))}</ul>
        </section>
      )}
      <section>
        <h2>{c.wrongTitle}</h2>
        {r.wrong.length === 0 ? <p className="muted">{c.noWrong}</p> : (
          <ol className="wrong-list">{r.wrong.map((w) => (
            <li key={w.id}>{nm(w, "text", lang)} <span className="lvl-low">× {w.times}</span></li>
          ))}</ol>
        )}
      </section>
    </div>
  );
}

export function Copy({ text, label }: { text: string; label: string }) {
  const { t } = useT();
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(text).then(() => setDone(true), () => {})}>
      {done ? t.cls.copied : label}
    </button>
  );
}

export function ClassesView({ api, nav }: { api: AdminApi; nav: Nav }) {
  const { lang, t } = useT();
  const c = t.cls;
  const [rows, setRows] = useState<ClassRow[] | null>(null);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [scope, setScope] = useState<{ subjects: string[]; grades: number[] } | null>(null);
  const [form, setForm] = useState({ subjectId: "", grade: 0, letter: "" });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.classes().then(setRows, setError), [api]);
  useEffect(() => {
    load();
    Promise.all([api.subjects(), api.teacherScope()]).then(([s, sc]) => {
      setSubjects(s);
      setScope(sc);
      setForm((f) => ({ ...f, subjectId: sc?.subjects[0] ?? s[0]?.id ?? "", grade: sc?.grades[0] ?? 5 }));
    }, setError);
  }, [api, load]);

  const choices = subjects.filter((s) => !scope || scope.subjects.includes(s.id));
  const grades = scope?.grades.length ? GRADES.filter((g) => scope.grades.includes(g)) : GRADES;
  const subjectName = (id: string) => { const s = subjects.find((x) => x.id === id); return s ? `${s.icon} ${nm(s, "name", lang)}` : "…"; };

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { id } = await api.createClass(form.subjectId, form.grade, form.letter);
      nav({ name: "class", id });
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <div className="st-page">
      <div className="help-head"><h1>{c.title}</h1><HelpLink id="class" /></div>
      <p className="muted">{c.lede}</p>
      {error !== null && <p className="error" role="alert">{humanError(error, t)}</p>}
      {rows === null ? error === null && <p className="loading">{t.loading}</p> : rows.length === 0 ? <><p className="muted">{c.none}</p><p className="muted">{t.hl.noClass}</p></> : (
        <ul className="cls-list">
          {rows.map((r) => (
            <li key={r.id}>
              <Go to={{ name: "class", id: r.id }} nav={nav} className="cls-card">
                <b>{c.name(r.grade, r.letter)} · {subjectName(r.subject_id)}</b>
                <span className="muted">{c.students(r.students ?? 0)} · {c.code}: <code>{r.join_code}</code></span>
              </Go>
            </li>
          ))}
        </ul>
      )}
      <form className="st-card cls-new" onSubmit={create}>
        <h2>{c.newTitle}</h2>
        <div className="adm-row grow">
          <label>{c.subject}
            <select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
              {choices.map((s) => <option key={s.id} value={s.id}>{nm(s, "name", lang)}</option>)}
            </select>
          </label>
          <label>{c.grade}
            <select value={form.grade} onChange={(e) => setForm({ ...form, grade: Number(e.target.value) })}>
              {grades.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <label>{c.letter}
            <input value={form.letter} maxLength={10} placeholder="А" onChange={(e) => setForm({ ...form, letter: e.target.value })} />
          </label>
        </div>
        <button type="submit" className="btn" disabled={busy || !form.subjectId}>{c.create}</button>
      </form>
    </div>
  );
}

export function ClassPage({ api, id, nav }: { api: AdminApi; id: string; nav: Nav }) {
  const { lang, t } = useT();
  const c = t.cls;
  const [rep, setRep] = useState<ClassReport | null>(null);
  const [subject, setSubject] = useState<SubjectRow | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => api.classReport(id).then((r) => {
    setRep(r);
    return api.subjects().then((s) => setSubject(s.find((x) => x.id === r.class.subject_id) ?? null));
  }).catch(setError), [api, id]);
  useEffect(() => { load(); }, [load]);

  if (!rep) return <div className="st-page">{error !== null ? <p className="error" role="alert">{humanError(error, t)}</p> : <p className="loading">{t.loading}</p>}</div>;
  const k = rep.class;
  const link = joinLink(k.join_code);
  const site = subject ? `${location.origin}/${lang}/${k.grade}/${subject.slug}/` : "";
  const date = (s: string | null) => (s ? new Date(s).toLocaleDateString() : "—");

  async function remove(studentId: string, name: string) {
    if (!confirm(c.confirmRemove(name))) return;
    try { await api.removeMember(id, studentId); await load(); } catch (e) { setError(e); }
  }
  async function exportExcel() {
    try {
      const m = await api.classMatrix(id);
      await download(`${c.file(k.grade, k.letter)}.xlsx`, classSheets(rep!, m, lang, t));
    } catch (e) { setError(e); }
  }
  async function del() {
    if (!confirm(c.confirmDelete)) return;
    try { await api.deleteClass(id); nav({ name: "classes" }); } catch (e) { setError(e); }
  }

  return (
    <div className="st-page">
      <Go to={{ name: "classes" }} nav={nav} className="st-back">← {c.title}</Go>
      <h1>{c.name(k.grade, k.letter)} · {subject ? `${subject.icon} ${nm(subject, "name", lang)}` : "…"}</h1>
      {error !== null && <p className="error" role="alert">{humanError(error, t)}</p>}

      <p className="adm-row"><button type="button" className="btn ghost sm" onClick={exportExcel}>{c.excel}</button>
        <Go to={{ name: "memo", id }} nav={nav} className="btn ghost sm">{c.memo}</Go></p>

      <section className="st-card cls-join">
        <div className="help-head"><h2>{c.joinTitle}</h2><HelpLink id="class" /></div>
        <p className="cls-code" aria-label={c.code}>{k.join_code}</p>
        <p className="muted">{c.joinHint}</p>
        <p className="cls-link"><code>{link}</code> <Copy text={link} label={c.copyLink} /></p>
      </section>

      {site && (
        <section className="st-card">
          <h2>{c.taskTitle}</h2>
          <p className="muted">{c.taskHint}</p>
          <p className="cls-link"><code>{site}</code> <Copy text={site} label={c.copyLink} /></p>
        </section>
      )}

      <section>
        <h2>{c.studentsTitle(rep.students.length)}</h2>
        {rep.students.length === 0 ? <><p className="muted">{c.noStudents}</p><p className="muted">{t.hl.noStudents} <Go to={{ name: "memo", id }} nav={nav}>{c.memo} →</Go></p></> : (
          <div className="us-table-wrap"><table className="us-table cls-table">
            <thead><tr><th>{c.student}</th><th>{c.runs}</th><th>{c.percent}</th><th>{c.last}</th><th /></tr></thead>
            <tbody>
              {rep.students.map((s) => (
                <tr key={s.id}>
                  <td><Go to={{ name: "student", classId: id, id: s.id }} nav={nav}><b>{s.display_name || s.nickname}</b></Go>
                    {s.display_name && <small className="muted"> {s.nickname}</small>}</td>
                  <td>{s.runs}</td>
                  <td className={s.percent === null ? "" : s.percent >= 80 ? "lvl-ok" : s.percent >= 50 ? "lvl-mid" : "lvl-low"}>
                    {s.percent === null ? "—" : `${s.percent}%`}</td>
                  <td>{date(s.last_at)}</td>
                  <td><button type="button" className="link danger" onClick={() => remove(s.id, s.display_name || s.nickname)}>{c.remove}</button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      <Assignments api={api} classId={id} subjectId={k.subject_id} grade={k.grade} />

      <Matrix api={api} id={id} grade={k.grade} nav={nav} />

      {rep.topics.length > 0 && (
        <section>
          <h2>{c.topicsTitle}</h2>
          <p className="muted">{c.topicsHint}</p>
          <ul className="cls-topics">
            {rep.topics.map((tp) => (
              <li key={tp.topic_id}>
                <span>{nm(tp, "title", lang) || "—"}{tp.grade !== null && tp.grade !== k.grade && <span className="muted"> · {c.otherGrade(tp.grade)}</span>}</span>
                <span className={tp.percent >= 80 ? "lvl-ok" : tp.percent >= 50 ? "lvl-mid" : "lvl-low"}>{tp.percent}%</span>
                <span className="muted">{c.answers(tp.answers, tp.students)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p><button type="button" className="link danger" onClick={del}>{c.deleteClass}</button></p>
    </div>
  );
}
