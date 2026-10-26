import { useCallback, useEffect, useState } from "react";
import { tx } from "../lib/text";
import { GRADES, LANGS, type Lang, type Text } from "../lib/types";
import { humanError, type AdminApi, type Counts, type Me, type QuestionItem, type SubjectRow, type TopicRow } from "./api";
import { STATUS_LABEL, type Status } from "./form";

/** Текст из колонок name_kk / name_ru / name_en (и т. п.); в админке главный язык — русский. */
export const ru = (row: object, prefix: string): string => {
  const r = row as Record<string, string | null>;
  const t: Text = { kk: r[`${prefix}_kk`] ?? "", ru: r[`${prefix}_ru`] ?? "", en: r[`${prefix}_en`] ?? "" };
  return tx(t, "ru");
};

// Выбор класса, предмета, темы и фильтров переживает переход в форму вопроса и обратно.
const KEY = "bt-admin";
interface Sel {
  grade: number;
  subjectId: string | null;
  topicId: string | null;
  status: Status | "";
  missingLang: Lang | "";
  search: string;
}
function loadSel(): Sel {
  const d: Sel = { grade: 5, subjectId: null, topicId: null, status: "", missingLang: "", search: "" };
  try {
    return { ...d, ...JSON.parse(sessionStorage.getItem(KEY) ?? "{}") };
  } catch {
    return d;
  }
}

interface Props {
  api: AdminApi;
  me: Me;
  onOpen: (questionId: string | null, topicId: string) => void;
}

export function Browser({ api, me, onOpen }: Props) {
  const [sel, setSel] = useState<Sel>(loadSel);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  const [questions, setQuestions] = useState<QuestionItem[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<"subject-new" | "subject" | "topic-new" | "topic" | null>(null);
  const isAdmin = me.role === "admin";

  const update = (p: Partial<Sel>) => setSel((s) => {
    const next = { ...s, ...p };
    try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* приватный режим */ }
    return next;
  });
  const fail = (e: unknown) => setError(humanError(e));

  const loadSubjects = useCallback(() => api.subjects().then(setSubjects, fail), [api]);
  useEffect(() => { loadSubjects(); }, [loadSubjects]);

  const loadTopics = useCallback(async () => {
    if (!sel.subjectId) { setTopics([]); setCounts({}); return; }
    try {
      const list = await api.topics(sel.subjectId, sel.grade);
      setTopics(list);
      setCounts(await api.counts(list.map((t) => t.id)));
    } catch (e) { fail(e); }
  }, [api, sel.subjectId, sel.grade]);
  useEffect(() => { loadTopics(); }, [loadTopics]);

  // Вопросы: в выбранной теме, иначе в предмете и классе; без предмета — только по фильтрам.
  const hasFilter = Boolean(sel.status || sel.missingLang || sel.search.trim());
  useEffect(() => {
    if (!sel.topicId && !sel.subjectId && !hasFilter) { setQuestions(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      api.questions({
        topicId: sel.topicId ?? undefined, subjectId: sel.subjectId ?? undefined, grade: sel.grade,
        status: sel.status || undefined, missingLang: sel.missingLang || undefined, search: sel.search,
      }).then((q) => alive && setQuestions(q), fail);
    }, sel.search ? 300 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [api, sel, hasFilter]);

  const subject = subjects.find((s) => s.id === sel.subjectId) ?? null;
  const topic = topics.find((t) => t.id === sel.topicId) ?? null;

  async function move(i: number, dir: -1 | 1) {
    const list = topics.slice();
    [list[i], list[i + dir]] = [list[i + dir], list[i]];
    try {
      // Номера по порядку; сохраняем только изменившиеся темы.
      await Promise.all(list.map((t, k) => (t.sort_order === k ? null : api.saveTopic({ ...t, sort_order: k }))));
      await loadTopics();
    } catch (e) { fail(e); }
  }

  async function removeTopic(t: TopicRow) {
    if (!confirm(`Удалить тему «${ru(t, "title")}»? Удалить можно только пустую тему.`)) return;
    try {
      await api.deleteTopic(t.id);
      update({ topicId: null });
      await loadTopics();
    } catch (e) { fail(e); }
  }

  async function removeSubject(s: SubjectRow) {
    if (!confirm(`Удалить предмет «${ru(s, "name")}»? Удалить можно только предмет без тем.`)) return;
    try {
      await api.deleteSubject(s.id);
      update({ subjectId: null, topicId: null });
      await loadSubjects();
    } catch (e) { fail(e); }
  }

  return (
    <div className="adm-cols">
      <aside className="adm-side">
        <div className="label">Класс</div>
        <div className="adm-grades" role="group" aria-label="Класс">
          {GRADES.map((g) => (
            <button key={g} type="button" aria-pressed={g === sel.grade} onClick={() => update({ grade: g, topicId: null })}>
              {g}
            </button>
          ))}
        </div>

        <div className="adm-head">
          <span className="label">Предмет</span>
          {isAdmin && <button type="button" className="link" onClick={() => setEditing("subject-new")}>+ предмет</button>}
        </div>
        <select aria-label="Предмет" value={sel.subjectId ?? ""}
          onChange={(e) => update({ subjectId: e.target.value || null, topicId: null })}>
          <option value="">— все предметы —</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.icon} {ru(s, "name")}</option>)}
        </select>
        {isAdmin && subject && (
          <div className="adm-row">
            <button type="button" className="link" onClick={() => setEditing("subject")}>изменить предмет</button>
            <button type="button" className="link danger" onClick={() => removeSubject(subject)}>удалить</button>
          </div>
        )}
        {(editing === "subject-new" || (editing === "subject" && subject)) && (
          <SubjectForm api={api} subject={editing === "subject" ? subject : null} nextSort={subjects.length}
            onDone={(saved) => { setEditing(null); if (saved) loadSubjects(); }} />
        )}

        {subject && (
          <>
            <div className="adm-head">
              <span className="label">Темы · {sel.grade} класс</span>
              <button type="button" className="link" onClick={() => setEditing("topic-new")}>+ тема</button>
            </div>
            {editing === "topic-new" && (
              <TopicForm api={api} topic={null} base={{ subject_id: subject.id, grade: sel.grade, sort_order: topics.length }}
                onDone={(saved) => { setEditing(null); if (saved) loadTopics(); }} />
            )}
            {topics.length === 0 && <p className="muted">Тем пока нет.</p>}
            <ol className="adm-topics">
              <li>
                <button type="button" aria-pressed={!sel.topicId} onClick={() => update({ topicId: null })}>
                  Все темы
                </button>
              </li>
              {topics.map((t, i) => {
                const c = counts[t.id];
                return (
                  <li key={t.id}>
                    <button type="button" aria-pressed={t.id === sel.topicId} onClick={() => update({ topicId: t.id })}>
                      <span>{ru(t, "title")}</span>
                      <small>
                        {c ? c.published : 0}
                        {c?.review ? <span className="st review" title="На проверке"> +{c.review}</span> : null}
                        {c?.draft ? <span className="st draft" title="Черновики"> +{c.draft}</span> : null}
                      </small>
                    </button>
                    {t.id === sel.topicId && (
                      <div className="adm-row">
                        <button type="button" className="link" onClick={() => setEditing("topic")}>переименовать</button>
                        <button type="button" className="link" disabled={i === 0} onClick={() => move(i, -1)}
                          aria-label="Выше">↑</button>
                        <button type="button" className="link" disabled={i === topics.length - 1} onClick={() => move(i, 1)}
                          aria-label="Ниже">↓</button>
                        {isAdmin && <button type="button" className="link danger" onClick={() => removeTopic(t)}>удалить</button>}
                      </div>
                    )}
                    {t.id === sel.topicId && editing === "topic" && (
                      <TopicForm api={api} topic={t} base={t} onDone={(saved) => { setEditing(null); if (saved) loadTopics(); }} />
                    )}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </aside>

      <section className="adm-main">
        <div className="adm-filters">
          <input type="search" placeholder="Поиск по тексту вопроса" aria-label="Поиск" value={sel.search}
            onChange={(e) => update({ search: e.target.value })} />
          <select aria-label="Статус" value={sel.status} onChange={(e) => update({ status: e.target.value as Status | "" })}>
            <option value="">Любой статус</option>
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <select aria-label="Язык" value={sel.missingLang}
            onChange={(e) => update({ missingLang: e.target.value as Lang | "" })}>
            <option value="">Все языки</option>
            {LANGS.map((l) => <option key={l} value={l}>Нет текста на {l.toUpperCase()}</option>)}
          </select>
        </div>

        <div className="adm-head">
          <h2>{topic ? ru(topic, "title") : subject ? `${ru(subject, "name")} · ${sel.grade} класс` : "Вопросы"}</h2>
          {topic && <button type="button" className="btn" onClick={() => onOpen(null, topic.id)}>+ Новый вопрос</button>}
        </div>
        {error && <p className="error" role="alert">{error} <button type="button" className="link" onClick={() => setError("")}>×</button></p>}

        {questions === null ? (
          <p className="muted">Выберите предмет и тему слева или задайте фильтр.</p>
        ) : questions.length === 0 ? (
          <p className="muted">Вопросов не найдено.</p>
        ) : (
          <QuestionList items={questions} showTopic={!topic} onOpen={onOpen} />
        )}
        {questions && questions.length >= 300 && <p className="muted">Показаны первые 300. Уточните фильтр.</p>}
      </section>
    </div>
  );
}

export function QuestionList({ items, showTopic, onOpen }: {
  items: QuestionItem[];
  showTopic: boolean;
  onOpen: (id: string, topicId: string) => void;
}) {
  return (
    <ol className="adm-qs">
      {items.map((q) => (
        <li key={q.id}>
          <button type="button" onClick={() => onOpen(q.id, q.topic_id)}>
            <span className="qt">{ru(q, "text") || <i>без текста</i>}</span>
            <span className="meta">
              <span className={`st ${q.status}`}>{STATUS_LABEL[q.status]}</span>
              {showTopic && <span>{q.topics.grade} кл. · {ru(q.topics, "title")}</span>}
              {LANGS.filter((l) => !(q as unknown as Record<string, string | null>)[`text_${l}`]?.trim())
                .map((l) => <span key={l} className="miss">нет {l.toUpperCase()}</span>)}
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
  const [s, setS] = useState<Omit<SubjectRow, "id">>(subject ?? {
    slug: "", icon: "", name_kk: "", name_ru: "", name_en: "", only_lang: null, sort_order: nextSort,
  });
  const [error, setError] = useState("");
  const set = (p: Partial<typeof s>) => setS({ ...s, ...p });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.saveSubject({ ...s, id: subject?.id });
      onDone(true);
    } catch (err) { setError(humanError(err)); }
  }

  return (
    <form className="adm-mini" onSubmit={save}>
      <label>Код (латиница, для адресов)<input required pattern="[a-z0-9_-]{1,40}" value={s.slug}
        onChange={(e) => set({ slug: e.target.value })} /></label>
      <label>Значок (1–2 символа)<input maxLength={8} value={s.icon} onChange={(e) => set({ icon: e.target.value })} /></label>
      {LANGS.map((l) => (
        <label key={l}>Название {l.toUpperCase()}<input required value={s[`name_${l}`]}
          onChange={(e) => set({ [`name_${l}`]: e.target.value })} /></label>
      ))}
      <label>Вопросы только на одном языке
        <select value={s.only_lang ?? ""} onChange={(e) => set({ only_lang: (e.target.value || null) as Lang | null })}>
          <option value="">нет, на трёх языках</option>
          {LANGS.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
        </select>
      </label>
      {error && <p className="error">{error}</p>}
      <div className="adm-row">
        <button type="submit" className="btn sm">Сохранить</button>
        <button type="button" className="btn ghost sm" onClick={() => onDone(false)}>Отмена</button>
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
  const [titles, setTitles] = useState<Record<Lang, string>>({
    kk: topic?.title_kk ?? "", ru: topic?.title_ru ?? "", en: topic?.title_en ?? "",
  });
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!LANGS.some((l) => titles[l].trim())) { setError("Напишите название хотя бы на одном языке."); return; }
    try {
      await api.saveTopic({
        id: topic?.id, subject_id: base.subject_id, grade: base.grade, sort_order: base.sort_order,
        title_kk: titles.kk.trim(), title_ru: titles.ru.trim(), title_en: titles.en.trim(),
      });
      onDone(true);
    } catch (err) { setError(humanError(err)); }
  }

  return (
    <form className="adm-mini" onSubmit={save}>
      {LANGS.map((l) => (
        <label key={l}>Название {l.toUpperCase()}<input value={titles[l]} autoFocus={l === "kk"}
          onChange={(e) => setTitles({ ...titles, [l]: e.target.value })} /></label>
      ))}
      {error && <p className="error">{error}</p>}
      <div className="adm-row">
        <button type="submit" className="btn sm">Сохранить</button>
        <button type="button" className="btn ghost sm" onClick={() => onDone(false)}>Отмена</button>
      </div>
    </form>
  );
}
