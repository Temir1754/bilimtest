// «Сыныптарым» — классы учителя (DECISIONS.md №102): создать класс, код и ссылка для учеников, отчёт по классу.
// Задание в первой версии — ссылка на предмет или тему сайта: учитель отправляет её в группу класса,
// а все тесты ученика по предмету класса попадают в отчёт (№57).
import { useCallback, useEffect, useState } from "react";
import { GRADES } from "../lib/types";
import { humanError, type AdminApi, type ClassReport, type ClassRow, type SubjectRow } from "./api";
import { nm, useT } from "./lang";
import { Go, type Nav } from "./Steps";

export const joinLink = (code: string) => `${location.origin}/me?join=${code}`;

function Copy({ text, label }: { text: string; label: string }) {
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
      <h1>{c.title}</h1>
      <p className="muted">{c.lede}</p>
      {error !== null && <p className="error" role="alert">{humanError(error, t)}</p>}
      {rows === null ? error === null && <p className="loading">{t.loading}</p> : rows.length === 0 ? <p className="muted">{c.none}</p> : (
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
  async function del() {
    if (!confirm(c.confirmDelete)) return;
    try { await api.deleteClass(id); nav({ name: "classes" }); } catch (e) { setError(e); }
  }

  return (
    <div className="st-page">
      <Go to={{ name: "classes" }} nav={nav} className="st-back">← {c.title}</Go>
      <h1>{c.name(k.grade, k.letter)} · {subject ? `${subject.icon} ${nm(subject, "name", lang)}` : "…"}</h1>
      {error !== null && <p className="error" role="alert">{humanError(error, t)}</p>}

      <section className="st-card cls-join">
        <h2>{c.joinTitle}</h2>
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
        {rep.students.length === 0 ? <p className="muted">{c.noStudents}</p> : (
          <div className="us-table-wrap"><table className="us-table cls-table">
            <thead><tr><th>{c.student}</th><th>{c.runs}</th><th>{c.percent}</th><th>{c.last}</th><th /></tr></thead>
            <tbody>
              {rep.students.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.display_name || s.nickname}</b>{s.display_name && <small className="muted"> {s.nickname}</small>}</td>
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
