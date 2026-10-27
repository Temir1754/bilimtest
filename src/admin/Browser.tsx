import { useCallback, useEffect, useRef, useState } from "react";
import { GRADES, LANGS, type Lang } from "../lib/types";
import { humanError, type AdminApi, type Counts, type Me, type QuestionItem, type SubjectRow, type TopicRow } from "./api";
import { checkSheet, download, exportSheet } from "./excel";
import { fromRow, publishProblems, type Status } from "./form";
import { nm, useT } from "./lang";

// Выбор класса, предмета, темы и фильтров переживает переход в форму вопроса и обратно.
const KEY = "bt-admin";
interface Sel {
  grade: number;
  subjectId: string | null;
  topicId: string | null;
  status: Status | "";
  missingLang: Lang | "";
  search: string;
  teacherCheck: boolean; // «требует проверки учителем» — по всем классам и предметам
}
function loadSel(): Sel {
  const d: Sel = { grade: 5, subjectId: null, topicId: null, status: "", missingLang: "", search: "", teacherCheck: false };
  try {
    return { ...d, ...JSON.parse(sessionStorage.getItem(KEY) ?? "{}") };
  } catch {
    return d;
  }
}

const STATUSES: Status[] = ["draft", "review", "published"];

interface Props {
  api: AdminApi;
  me: Me;
  onOpen: (questionId: string | null, topicId: string) => void;
  onImport: (subjectId: string, grade: number) => void;
}

export function Browser({ api, me, onOpen, onImport }: Props) {
  const { lang, t } = useT();
  const b = t.browse;
  const [sel, setSel] = useState<Sel>(loadSel);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  const [questions, setQuestions] = useState<QuestionItem[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<"subject-new" | "subject" | "topic-new" | "topic" | null>(null);
  const [busy, setBusy] = useState<"export" | "publish" | null>(null);
  const [reload, setReload] = useState(0); // меняется — список вопросов загружается заново
  const mainRef = useRef<HTMLElement>(null);
  const isAdmin = me.role === "admin";

  const update = (p: Partial<Sel>) => setSel((s) => {
    const next = { ...s, ...p };
    try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* приватный режим */ }
    return next;
  });

  // На узком экране список вопросов стоит под темами — после выбора темы прокручиваем к нему.
  const pickTopic = (topicId: string | null) => {
    update({ topicId });
    setNotice("");
    if (window.matchMedia?.("(max-width: 820px)").matches) {
      setTimeout(() => mainRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    }
  };

  const loadSubjects = useCallback(() => api.subjects().then(setSubjects, setError), [api]);
  useEffect(() => { loadSubjects(); }, [loadSubjects]);

  const loadTopics = useCallback(async () => {
    if (!sel.subjectId) { setTopics([]); setCounts({}); return; }
    try {
      const list = await api.topics(sel.subjectId, sel.grade);
      setTopics(list);
      setCounts(await api.counts(list.map((x) => x.id)));
    } catch (e) { setError(e); }
  }, [api, sel.subjectId, sel.grade]);
  useEffect(() => { loadTopics(); }, [loadTopics]);

  // Вопросы: в выбранной теме, иначе в предмете и классе; без предмета — только по фильтрам.
  // «Требует проверки учителем» — по всем классам и предметам: таких вопросов немного, их отдают учителю списком.
  const hasFilter = Boolean(sel.status || sel.missingLang || sel.search.trim() || sel.teacherCheck);
  useEffect(() => {
    if (!sel.topicId && !sel.subjectId && !hasFilter) { setQuestions(null); return; }
    let alive = true;
    const where = sel.teacherCheck ? { teacherCheck: true }
      : { topicId: sel.topicId ?? undefined, subjectId: sel.subjectId ?? undefined, grade: sel.grade };
    const timer = setTimeout(() => {
      api.questions({
        ...where, status: sel.status || undefined, missingLang: sel.missingLang || undefined, search: sel.search,
      }).then((q) => alive && setQuestions(q), setError);
    }, sel.search ? 300 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [api, sel, hasFilter, reload]);

  const subject = subjects.find((s) => s.id === sel.subjectId) ?? null;
  const topic = topics.find((x) => x.id === sel.topicId) ?? null;

  async function move(i: number, dir: -1 | 1) {
    const list = topics.slice();
    [list[i], list[i + dir]] = [list[i + dir], list[i]];
    try {
      // Номера по порядку; сохраняем только изменившиеся темы.
      await Promise.all(list.map((x, k) => (x.sort_order === k ? null : api.saveTopic({ ...x, sort_order: k }))));
      await loadTopics();
    } catch (e) { setError(e); }
  }

  // Выгрузка: выбранная тема или все темы предмета в этом классе.
  async function exportExcel(s: SubjectRow) {
    setBusy("export");
    try {
      const items = await api.exportQuestions(s.id, sel.grade, sel.topicId ?? undefined);
      if (!items.length) { setNotice(b.nothingToExport); return; }
      await download(`${t.xl.file(s.slug, sel.grade)}${topic ? "-" + (topic.sort_order + 1) : ""}.xlsx`,
        { [t.xl.sheet]: exportSheet(items, t) });
    } catch (e) { setError(e); } finally { setBusy(null); }
  }

  // Выгрузка всех вопросов «требует проверки учителем» — список для учителя.
  async function exportChecks() {
    setBusy("export");
    try {
      const items = await api.exportChecks();
      if (!items.length) { setNotice(b.nothingToExport); return; }
      await download(`${b.checkFile}.xlsx`, {
        [t.xl.sheet]: checkSheet(items.map((x) => ({ ...x, subject: nm(x.subject, "name", lang) })), t),
      });
    } catch (e) { setError(e); } finally { setBusy(null); }
  }

  // «Опубликовать готовые черновики»: только вопросы без ошибок (те же проверки, что у кнопки «Опубликовать»).
  async function publishReady(s: SubjectRow, tp: TopicRow) {
    setBusy("publish");
    setNotice("");
    try {
      const pending = (await api.exportQuestions(s.id, sel.grade, tp.id)).map((x) => x.q)
        .filter((q) => q.status !== "published");
      if (!pending.length) { setNotice(b.nothingToPublish); return; }
      const ready = pending.filter((q) => publishProblems(fromRow(q), s.only_lang, t).length === 0);
      const skipped = pending.length - ready.length;
      if (!ready.length) { setNotice(b.noneReady); return; }
      if (!confirm(b.confirmPublish(ready.length, skipped))) return;
      await api.publish(ready.map((q) => q.id));
      setNotice(b.publishedN(ready.length, skipped));
      setReload((n) => n + 1);
      await loadTopics();
    } catch (e) { setError(e); } finally { setBusy(null); }
  }

  async function removeTopic(x: TopicRow) {
    if (!confirm(b.confirmDelTopic(nm(x, "title", lang)))) return;
    try {
      await api.deleteTopic(x.id);
      update({ topicId: null });
      await loadTopics();
    } catch (e) { setError(e); }
  }

  async function removeSubject(s: SubjectRow) {
    if (!confirm(b.confirmDelSubject(nm(s, "name", lang)))) return;
    try {
      await api.deleteSubject(s.id);
      update({ subjectId: null, topicId: null });
      await loadSubjects();
    } catch (e) { setError(e); }
  }

  return (
    <div className="adm-cols">
      <aside className="adm-side">
        <div className="label">{b.grade}</div>
        <div className="adm-grades" role="group" aria-label={b.grade}>
          {GRADES.map((g) => (
            <button key={g} type="button" aria-pressed={g === sel.grade} onClick={() => update({ grade: g, topicId: null })}>
              {g}
            </button>
          ))}
        </div>

        <div className="adm-head">
          <span className="label">{b.subject}</span>
          {isAdmin && <button type="button" className="link" onClick={() => setEditing("subject-new")}>{b.addSubject}</button>}
        </div>
        <select aria-label={b.subject} value={sel.subjectId ?? ""}
          onChange={(e) => update({ subjectId: e.target.value || null, topicId: null })}>
          <option value="">{b.allSubjects}</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.icon} {nm(s, "name", lang)}</option>)}
        </select>
        {isAdmin && subject && (
          <div className="adm-row">
            <button type="button" className="link" onClick={() => setEditing("subject")}>{b.editSubject}</button>
            <button type="button" className="link danger" onClick={() => removeSubject(subject)}>{t.del}</button>
          </div>
        )}
        {(editing === "subject-new" || (editing === "subject" && subject)) && (
          <SubjectForm api={api} subject={editing === "subject" ? subject : null} nextSort={subjects.length}
            onDone={(saved) => { setEditing(null); if (saved) loadSubjects(); }} />
        )}

        {subject && (
          <>
            <div className="adm-head">
              <span className="label">{b.topicsOf(sel.grade)}</span>
              <button type="button" className="link" onClick={() => setEditing("topic-new")}>{b.addTopic}</button>
            </div>
            {editing === "topic-new" && (
              <TopicForm api={api} topic={null} base={{ subject_id: subject.id, grade: sel.grade, sort_order: topics.length }}
                onDone={(saved) => { setEditing(null); if (saved) loadTopics(); }} />
            )}
            {topics.length === 0 && <p className="muted">{b.noTopics}</p>}
            <ol className="adm-topics">
              <li>
                <button type="button" aria-pressed={!sel.topicId} onClick={() => pickTopic(null)}>{b.allTopics}</button>
              </li>
              {topics.map((x, i) => {
                const c = counts[x.id];
                return (
                  <li key={x.id}>
                    <button type="button" aria-pressed={x.id === sel.topicId} onClick={() => pickTopic(x.id)}>
                      <span>{nm(x, "title", lang)}</span>
                      <small>
                        {c ? c.published : 0}
                        {c?.review ? <span className="st review" title={t.status.review}> +{c.review}</span> : null}
                        {c?.draft ? <span className="st draft" title={b.drafts}> +{c.draft}</span> : null}
                      </small>
                    </button>
                    {x.id === sel.topicId && (
                      <div className="adm-row">
                        <button type="button" className="link" onClick={() => setEditing("topic")}>{b.rename}</button>
                        <button type="button" className="link" disabled={i === 0} onClick={() => move(i, -1)}
                          aria-label={b.up}>↑</button>
                        <button type="button" className="link" disabled={i === topics.length - 1} onClick={() => move(i, 1)}
                          aria-label={b.down}>↓</button>
                        {isAdmin && <button type="button" className="link danger" onClick={() => removeTopic(x)}>{t.del}</button>}
                      </div>
                    )}
                    {x.id === sel.topicId && editing === "topic" && (
                      <TopicForm api={api} topic={x} base={x} onDone={(saved) => { setEditing(null); if (saved) loadTopics(); }} />
                    )}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </aside>

      <section className="adm-main" ref={mainRef}>
        <div className="adm-filters">
          <input type="search" placeholder={b.search} aria-label={b.searchLabel} value={sel.search}
            onChange={(e) => update({ search: e.target.value })} />
          <select aria-label={b.statusLabel} value={sel.status} onChange={(e) => update({ status: e.target.value as Status | "" })}>
            <option value="">{b.anyStatus}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t.status[s]}</option>)}
          </select>
          <select aria-label={b.langFilter} value={sel.missingLang}
            onChange={(e) => update({ missingLang: e.target.value as Lang | "" })}>
            <option value="">{b.allLangs}</option>
            {LANGS.map((l) => <option key={l} value={l}>{b.missing(l.toUpperCase())}</option>)}
          </select>
          <label className="adm-check">
            <input type="checkbox" checked={sel.teacherCheck} onChange={(e) => update({ teacherCheck: e.target.checked })} />
            {b.needsCheck}
          </label>
        </div>

        <div className="adm-head">
          <h2>{sel.teacherCheck ? b.needsCheck : topic ? nm(topic, "title", lang)
            : subject ? b.subjGrade(nm(subject, "name", lang), sel.grade) : b.questions}</h2>
          {sel.teacherCheck ? (
            <div className="adm-row">
              <button type="button" className="btn ghost sm" disabled={busy !== null} onClick={exportChecks}>
                {busy === "export" ? b.exporting : b.exportBtn}
              </button>
            </div>
          ) : (
            <div className="adm-row">
              {subject && (
                <>
                  <button type="button" className="btn ghost sm" onClick={() => onImport(subject.id, sel.grade)}>
                    {b.importBtn}
                  </button>
                  <button type="button" className="btn ghost sm" disabled={busy !== null} onClick={() => exportExcel(subject)}>
                    {busy === "export" ? b.exporting : b.exportBtn}
                  </button>
                </>
              )}
              {isAdmin && subject && topic && (
                <button type="button" className="btn ghost sm" disabled={busy !== null} onClick={() => publishReady(subject, topic)}>
                  {busy === "publish" ? b.publishing : b.publishReady}
                </button>
              )}
              {topic && <button type="button" className="btn sm" onClick={() => onOpen(null, topic.id)}>{b.newQuestion}</button>}
            </div>
          )}
        </div>
        {error !== null && (
          <p className="error" role="alert">{humanError(error, t)}{" "}
            <button type="button" className="link" onClick={() => setError(null)}>×</button></p>
        )}
        {notice && <p className="note" role="status">{notice}</p>}

        {questions === null ? (
          <p className="muted">{b.pickHint}</p>
        ) : questions.length === 0 ? (
          <p className="muted">{b.noneFound}</p>
        ) : (
          <QuestionList items={questions} showTopic={!topic || sel.teacherCheck} onOpen={onOpen} />
        )}
        {questions && questions.length >= 300 && <p className="muted">{b.first300}</p>}
      </section>
    </div>
  );
}

export function QuestionList({ items, showTopic, onOpen }: {
  items: QuestionItem[];
  showTopic: boolean;
  onOpen: (id: string, topicId: string) => void;
}) {
  const { lang, t } = useT();
  return (
    <ol className="adm-qs">
      {items.map((q) => (
        <li key={q.id}>
          <button type="button" onClick={() => onOpen(q.id, q.topic_id)}>
            <span className="qt">{nm(q, "text", lang) || <i>{t.browse.noText}</i>}</span>
            <span className="meta">
              <span className={`st ${q.status}`}>{t.status[q.status]}</span>
              {showTopic && <span>{t.browse.gradeShort(q.topics.grade)} · {nm(q.topics, "title", lang)}</span>}
              {q.teacher_check && <span className="miss" title={q.teacher_check}>{t.browse.checkShort}</span>}
              {LANGS.filter((l) => !(q as unknown as Record<string, string | null>)[`text_${l}`]?.trim())
                .map((l) => <span key={l} className="miss">{t.browse.missShort(l.toUpperCase())}</span>)}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function SubjectForm({ api, subject, nextSort, onDone }: {
  api: AdminApi;
  subject: SubjectRow | null;
  nextSort: number;
  onDone: (saved: boolean) => void;
}) {
  const { t } = useT();
  const f = t.subjectForm;
  const [s, setS] = useState<Omit<SubjectRow, "id">>(subject ?? {
    slug: "", icon: "", name_kk: "", name_ru: "", name_en: "", only_lang: null, sort_order: nextSort,
  });
  const [error, setError] = useState<unknown>(null);
  const set = (p: Partial<typeof s>) => setS({ ...s, ...p });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.saveSubject({ ...s, id: subject?.id });
      onDone(true);
    } catch (err) { setError(err); }
  }

  return (
    <form className="adm-mini" onSubmit={save}>
      <label>{f.slug}<input required pattern="[a-z0-9_-]{1,40}" value={s.slug}
        onChange={(e) => set({ slug: e.target.value })} /></label>
      <label>{f.icon}<input maxLength={8} value={s.icon} onChange={(e) => set({ icon: e.target.value })} /></label>
      {LANGS.map((l) => (
        <label key={l}>{f.name(l.toUpperCase())}<input required value={s[`name_${l}`]}
          onChange={(e) => set({ [`name_${l}`]: e.target.value })} /></label>
      ))}
      <label>{f.onlyLang}
        <select value={s.only_lang ?? ""} onChange={(e) => set({ only_lang: (e.target.value || null) as Lang | null })}>
          <option value="">{f.threeLangs}</option>
          {LANGS.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
        </select>
      </label>
      {error !== null && <p className="error">{humanError(error, t)}</p>}
      <div className="adm-row">
        <button type="submit" className="btn sm">{t.save}</button>
        <button type="button" className="btn ghost sm" onClick={() => onDone(false)}>{t.cancel}</button>
      </div>
    </form>
  );
}

function TopicForm({ api, topic, base, onDone }: {
  api: AdminApi;
  topic: TopicRow | null;
  base: Pick<TopicRow, "subject_id" | "grade" | "sort_order">;
  onDone: (saved: boolean) => void;
}) {
  const { t } = useT();
  const [titles, setTitles] = useState<Record<Lang, string>>({
    kk: topic?.title_kk ?? "", ru: topic?.title_ru ?? "", en: topic?.title_en ?? "",
  });
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!LANGS.some((l) => titles[l].trim())) { setError(t.topicForm.needTitle); return; }
    try {
      await api.saveTopic({
        id: topic?.id, subject_id: base.subject_id, grade: base.grade, sort_order: base.sort_order,
        title_kk: titles.kk.trim(), title_ru: titles.ru.trim(), title_en: titles.en.trim(),
      });
      onDone(true);
    } catch (err) { setError(humanError(err, t)); }
  }

  return (
    <form className="adm-mini" onSubmit={save}>
      {LANGS.map((l) => (
        <label key={l}>{t.topicForm.title(l.toUpperCase())}<input value={titles[l]} autoFocus={l === "kk"}
          onChange={(e) => setTitles({ ...titles, [l]: e.target.value })} /></label>
      ))}
      {error && <p className="error">{error}</p>}
      <div className="adm-row">
        <button type="submit" className="btn sm">{t.save}</button>
        <button type="button" className="btn ghost sm" onClick={() => onDone(false)}>{t.cancel}</button>
      </div>
    </form>
  );
}
