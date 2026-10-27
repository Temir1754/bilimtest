import { useEffect, useMemo, useState } from "react";
import { GRADES, type Lang } from "../lib/types";
import { humanError, type AdminApi, type SectionRow, type SubjectRow, type TopicRow } from "./api";
import { readDocx, parseTest } from "./docx";
import { ColumnMapper, DraftPreview } from "./DraftPreview";
import { detectLang, draftRows, guessColumns, sheetToDrafts, type Draft, type DraftSet } from "./drafts";
import { download, parseSheet, readFile, templateSheets, toImportRows } from "./excel";
import { nm, useT } from "./lang";

interface Props {
  api: AdminApi;
  subjectId: string;
  grade: number;
  onClose: () => void;
}

/** Загрузка вопросов из файла в предмет и класс (выбраны наверху, можно сменить):
 *  Excel по шаблону — как раньше; Excel со своими столбцами и Word — через таблицу-предпросмотр (№91). Всё — в черновики. */
export function ImportView({ api, subjectId: startSubject, grade: startGrade, onClose }: Props) {
  const { lang, t } = useT();
  const m = t.imp;
  const [subjectId, setSubjectId] = useState(startSubject);
  const [grade, setGrade] = useState(startGrade);
  const [changing, setChanging] = useState(false);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [inGrade, setInGrade] = useState<string[]>([]);
  const [scope, setScope] = useState<{ subjects: string[]; grades: number[] } | null>(null);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [sheet, setSheet] = useState<unknown[][] | null>(null); // строки Excel как есть
  const [mapping, setMapping] = useState(false); // Excel со своими столбцами: окно «какой столбец что значит»
  const [drafts, setDrafts] = useState<DraftSet | null>(null); // Word или Excel после выбора столбцов
  const [qLang, setQLang] = useState<Lang>("kk");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [readFailed, setReadFailed] = useState<string | null>(null);
  const [done, setDone] = useState<{ questions: number; topics: number } | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api.subjects().then(setSubjects, setError);
    api.teacherScope().then(setScope, setError);
  }, [api]);
  useEffect(() => { api.gradeSubjects(grade).then(setInGrade, setError); }, [api, grade]);
  useEffect(() => {
    api.topics(subjectId, grade).then(setTopics, setError);
    api.sections(subjectId, grade).then(setSections, setError);
  }, [api, subjectId, grade]);
  const subject = subjects.find((s) => s.id === subjectId) ?? null;
  const only = (subject?.only_lang ?? null) as Lang | null;

  // Проверка строк — при показе, поэтому сообщения переводятся вместе со сменой языка админки.
  const parsed = useMemo(() => (sheet && !mapping ? parseSheet(sheet, only, t) : null), [sheet, mapping, only, t]);

  function reset(name: string) {
    setError(null);
    setReadFailed(null);
    setDone(null);
    setSheet(null);
    setMapping(false);
    setDrafts(null);
    setFileName(name);
  }
  function useDrafts(set: DraftSet) {
    setDrafts(set);
    setQLang(only ?? detectLang(set.drafts.flatMap((d) => [d.text, ...d.options])));
  }

  async function pickExcel(file: File | undefined) {
    if (!file) return;
    reset(file.name);
    try {
      const aoa = await readFile(file);
      setSheet(aoa);
      // Столбцы не из шаблона — спрашиваем, какой столбец что значит.
      if (parseSheet(aoa, null, t).problems.includes(t.xl.notTemplate) && aoa.length > 1) setMapping(true);
    } catch {
      setReadFailed(m.readFail);
    }
  }
  async function pickWord(file: File | undefined) {
    if (!file) return;
    reset(file.name);
    try {
      const set = parseTest(await readDocx(file));
      if (!set.drafts.length) setReadFailed(m.noQuestions);
      else useDrafts(set);
    } catch {
      setReadFailed(m.wordFail);
    }
  }

  async function upload(rows: unknown[]) {
    setBusy(true);
    setError(null);
    try {
      setDone(await api.importQuestions(subjectId, grade, rows));
      setSheet(null);
      setDrafts(null);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const rows = parsed?.rows ?? [];
  const bad = rows.filter((r) => r.errors.length);
  const warn = rows.filter((r) => !r.errors.length && r.warnings.length);
  const good = rows.length - bad.length;
  const known = new Set(topics.flatMap((x) => [x.title_kk, x.title_ru, x.title_en].map((s) => s.trim().toLowerCase())));
  const newTopics = [...new Map(rows.filter((r) => !r.errors.length && !known.has(r.topic.toLowerCase()))
    .map((r) => [r.topic.toLowerCase(), r.topic])).values()];
  const shown = showAll ? rows : [...bad, ...warn];
  const grades = scope ? GRADES.filter((g) => scope.grades.includes(g)) : GRADES;
  const choices = subjects.filter((s) => inGrade.includes(s.id) && (!scope || scope.subjects.includes(s.id)));

  return (
    <div className="adm-editor im-page">
      <button type="button" className="back" onClick={onClose}>{m.back}</button>
      <div>
        <h2>{m.title}</h2>
        <p className="im-where">
          <b>{m.where(grade, subject ? `${subject.icon} ${nm(subject, "name", lang)}` : "…")}</b>{" "}
          <button type="button" className="link" aria-expanded={changing} onClick={() => setChanging(!changing)}>
            {changing ? m.apply : m.change}</button>
        </p>
        {changing && (
          <div className="adm-row grow im-change">
            <label>{m.gradeLabel}
              <select value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
                {grades.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
            <label>{m.subjectLabel}
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                {!choices.some((s) => s.id === subjectId) && <option value={subjectId}>—</option>}
                {choices.map((s) => <option key={s.id} value={s.id}>{nm(s, "name", lang)}</option>)}
              </select>
            </label>
          </div>
        )}
      </div>

      <ol className="adm-steps">
        <li>
          {m.step1}{" "}
          <button type="button" className="link" onClick={() => download(`bilimtest-${lang}.xlsx`, templateSheets(t))}>
            {m.template}
          </button>
        </li>
        <li>
          <label>{m.step2}
            <input type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={(e) => pickExcel(e.target.files?.[0])} />
          </label>
          <label>{m.word}
            <input type="file" accept=".docx" disabled={busy} onChange={(e) => pickWord(e.target.files?.[0])} />
          </label>
          <span className="hint">{m.wordHelp}</span>
        </li>
        <li>{m.step3}</li>
      </ol>

      {readFailed && <p className="error" role="alert">{readFailed}</p>}
      {error !== null && <p className="error" role="alert">{humanError(error, t)}</p>}
      {done && (
        <div className="adm-ready ok" role="status">
          <b>{m.done(done.questions, done.topics)}</b>
          <p>{m.doneHint}</p>
          <button type="button" className="btn sm" onClick={onClose}>{m.toQuestions}</button>
        </div>
      )}

      {sheet && mapping && (
        <ColumnMapper head={(sheet[0] ?? []).map(String)} sample={sheet[1] ?? []} start={guessColumns((sheet[0] ?? []).map(String))}
          onCancel={() => reset("")}
          onDone={(map) => { setMapping(false); useDrafts(sheetToDrafts(sheet, map)); setSheet(null); }} />
      )}

      {drafts && (
        <>
          <p className="muted">{m.file(fileName, drafts.drafts.length)}</p>
          <DraftPreview key={`${fileName}/${subjectId}/${grade}`} set={drafts} topics={topics} sections={sections} lang={qLang} fixedLang={only !== null}
            onLang={setQLang} busy={busy}
            onUpload={(ds: Draft[], topicOf) => upload(draftRows(ds, topicOf, qLang))} />
        </>
      )}

      {parsed && parsed.problems.length > 0 && <p className="error" role="alert">{parsed.problems.join(" ")}</p>}
      {parsed && rows.length > 0 && (
        <>
          <div className="adm-summary">
            <span>{m.file(fileName, rows.length)}</span>
            <span className="st published">{m.ready(good - warn.length)}</span>
            {warn.length > 0 && <span className="st review">{m.notes(warn.length)}</span>}
            {bad.length > 0 && <span className="st bad">{m.errors(bad.length)}</span>}
          </div>
          {newTopics.length > 0 && <p className="note">{m.newTopics(newTopics.map((x) => `«${x}»`).join(", "))}</p>}

          {shown.length === 0 && <p className="ok-msg">{m.allGood}</p>}
          {shown.length > 0 && (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead><tr><th>{m.line}</th><th>{t.xl.topic}</th><th>{t.xl.groups.text}</th><th>{m.check}</th></tr></thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.line} className={r.errors.length ? "bad" : r.warnings.length ? "warn" : ""}>
                      <td>{r.line}</td>
                      <td>{r.topic}</td>
                      <td>{r.text[lang] || r.text.ru || r.text.kk || r.text.en}</td>
                      <td>{r.errors.length ? `${m.errorPrefix} ${r.errors.join("; ")}` : r.warnings.length ? r.warnings.join("; ") : m.ok}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button type="button" className="link" onClick={() => setShowAll(!showAll)}>
            {showAll ? m.showProblems : m.showAll}
          </button>

          <div className="actions">
            <button type="button" className="btn" disabled={busy || good === 0} onClick={() => upload(toImportRows(parsed.rows))}>
              {busy ? m.uploading : m.upload(good)}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
