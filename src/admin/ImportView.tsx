import { useEffect, useMemo, useState } from "react";
import { humanError, type AdminApi, type SubjectRow, type TopicRow } from "./api";
import { download, parseSheet, readFile, templateSheets, toImportRows } from "./excel";
import { nm, useT } from "./lang";

interface Props {
  api: AdminApi;
  subjectId: string;
  grade: number;
  onClose: () => void;
}

/** Загрузка вопросов из Excel в выбранный предмет и класс: проверка строк → загрузка в черновики. */
export function ImportView({ api, subjectId, grade, onClose }: Props) {
  const { lang, t } = useT();
  const m = t.imp;
  const [subject, setSubject] = useState<SubjectRow | null>(null);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [sheet, setSheet] = useState<unknown[][] | null>(null); // строки файла как есть
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [done, setDone] = useState<{ questions: number; topics: number } | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    Promise.all([api.subjects(), api.topics(subjectId, grade)]).then(([subs, list]) => {
      setSubject(subs.find((s) => s.id === subjectId) ?? null);
      setTopics(list);
    }, setError);
  }, [api, subjectId, grade]);

  // Проверка строк — при показе, поэтому сообщения переводятся вместе со сменой языка админки.
  const parsed = useMemo(() => (sheet ? parseSheet(sheet, subject?.only_lang ?? null, t) : null), [sheet, subject, t]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setReadFailed(false);
    setDone(null);
    setSheet(null);
    setFileName(file.name);
    try {
      setSheet(await readFile(file));
    } catch {
      setReadFailed(true);
    }
  }

  async function upload() {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    try {
      setDone(await api.importQuestions(subjectId, grade, toImportRows(parsed.rows)));
      setSheet(null);
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

  return (
    <div className="adm-editor">
      <button type="button" className="back" onClick={onClose}>{m.back}</button>
      <div>
        <div className="kicker">{subject ? `${subject.icon} ${nm(subject, "name", lang)}` : ""} · {t.edit.grade(grade)}</div>
        <h2>{m.title}</h2>
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
            <input type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
          </label>
        </li>
        <li>{m.step3}</li>
      </ol>

      {readFailed && <p className="error" role="alert">{m.readFail}</p>}
      {error !== null && <p className="error" role="alert">{humanError(error, t)}</p>}
      {done && (
        <div className="adm-ready ok" role="status">
          <b>{m.done(done.questions, done.topics)}</b>
          <p>{m.doneHint}</p>
          <button type="button" className="btn sm" onClick={onClose}>{m.toQuestions}</button>
        </div>
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
            <button type="button" className="btn" disabled={busy || good === 0} onClick={upload}>
              {busy ? m.uploading : m.upload(good)}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
