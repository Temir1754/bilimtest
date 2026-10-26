import { useEffect, useState } from "react";
import { humanError, type AdminApi, type SubjectRow, type TopicRow } from "./api";
import { ru } from "./Browser";
import { download, parseSheet, readFile, templateSheets, toImportRows, type Parsed } from "./excel";

interface Props {
  api: AdminApi;
  subjectId: string;
  grade: number;
  onClose: () => void;
}

/** Загрузка вопросов из Excel в выбранный предмет и класс: проверка строк → загрузка в черновики. */
export function ImportView({ api, subjectId, grade, onClose }: Props) {
  const [subject, setSubject] = useState<SubjectRow | null>(null);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ questions: number; topics: number } | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    Promise.all([api.subjects(), api.topics(subjectId, grade)]).then(([subs, list]) => {
      setSubject(subs.find((s) => s.id === subjectId) ?? null);
      setTopics(list);
    }, (e) => setError(humanError(e)));
  }, [api, subjectId, grade]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError("");
    setDone(null);
    setParsed(null);
    setFileName(file.name);
    try {
      setParsed(parseSheet(await readFile(file), subject?.only_lang ?? null));
    } catch {
      setError("Не получилось прочитать файл. Сохраните его в Excel как .xlsx и попробуйте снова.");
    }
  }

  async function upload() {
    if (!parsed) return;
    setBusy(true);
    setError("");
    try {
      setDone(await api.importQuestions(subjectId, grade, toImportRows(parsed.rows)));
      setParsed(null);
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  const rows = parsed?.rows ?? [];
  const bad = rows.filter((r) => r.errors.length);
  const warn = rows.filter((r) => !r.errors.length && r.warnings.length);
  const good = rows.length - bad.length;
  const known = new Set(topics.flatMap((t) => [t.title_kk, t.title_ru, t.title_en].map((s) => s.trim().toLowerCase())));
  const newTopics = [...new Map(rows.filter((r) => !r.errors.length && !known.has(r.topic.toLowerCase()))
    .map((r) => [r.topic.toLowerCase(), r.topic])).values()];
  const shown = showAll ? rows : [...bad, ...warn];

  return (
    <div className="adm-editor">
      <button type="button" className="back" onClick={onClose}>← К вопросам</button>
      <div>
        <div className="kicker">{subject ? `${subject.icon} ${ru(subject, "name")}` : ""} · {grade} класс</div>
        <h2>Загрузка вопросов из Excel</h2>
      </div>

      <ol className="adm-steps">
        <li>
          Скачайте шаблон и заполните его: одна строка — один вопрос.{" "}
          <button type="button" className="link" onClick={() => download("bilimtest-shablon.xlsx", templateSheets())}>
            Скачать шаблон
          </button>
        </li>
        <li>
          <label>Выберите заполненный файл (.xlsx)
            <input type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
          </label>
        </li>
        <li>Проверьте результат и нажмите «Загрузить». Все вопросы попадут в черновики.</li>
      </ol>

      {error && <p className="error" role="alert">{error}</p>}
      {done && (
        <div className="adm-ready ok" role="status">
          <b>Готово: загружено вопросов — {done.questions}{done.topics ? `, новых тем — ${done.topics}` : ""}.</b>
          <p>Они в черновиках. Проверьте их и опубликуйте.</p>
          <button type="button" className="btn sm" onClick={onClose}>К вопросам</button>
        </div>
      )}

      {parsed && parsed.problems.length > 0 && <p className="error" role="alert">{parsed.problems.join(" ")}</p>}
      {parsed && rows.length > 0 && (
        <>
          <div className="adm-summary">
            <span>Файл <b>{fileName}</b>: вопросов {rows.length}.</span>
            <span className="st published">готово {good - warn.length}</span>
            {warn.length > 0 && <span className="st review">с замечаниями {warn.length}</span>}
            {bad.length > 0 && <span className="st bad">с ошибками {bad.length} — не загрузятся</span>}
          </div>
          {newTopics.length > 0 && (
            <p className="note">Будут созданы новые темы: {newTopics.map((t) => `«${t}»`).join(", ")}.
              Если тема должна быть существующей — проверьте, что название совпадает с названием в админке.</p>
          )}

          {shown.length === 0 && <p className="ok-msg">Все строки в порядке.</p>}
          {shown.length > 0 && (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead><tr><th>Строка</th><th>Тема</th><th>Вопрос</th><th>Проверка</th></tr></thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.line} className={r.errors.length ? "bad" : r.warnings.length ? "warn" : ""}>
                      <td>{r.line}</td>
                      <td>{r.topic}</td>
                      <td>{r.text.ru || r.text.kk || r.text.en}</td>
                      <td>{r.errors.length ? `Ошибка: ${r.errors.join("; ")}` : r.warnings.length ? r.warnings.join("; ") : "ок"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button type="button" className="link" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Показать только строки с замечаниями" : "Показать все строки"}
          </button>

          <div className="actions">
            <button type="button" className="btn" disabled={busy || good === 0} onClick={upload}>
              {busy ? "Загрузка…" : `Загрузить ${good} в черновики`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
