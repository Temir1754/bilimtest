// Шаг 3 экрана «Сұрақтар» (DECISIONS.md №87): форма вопроса — новый вопрос или правка.
// Сверху язык текста (казахский по умолчанию, русский и английский необязательны, №88), вопрос, 4 ответа с отметкой
// правильного (4-й необязателен), пояснение. Картинка, сложность, перенос в другую тему, предпросмотр, комментарий
// проверки и удаление — под «Қосымша ▾». Учитель сохраняет черновик и отправляет на проверку; админ публикует сразу.
import { useEffect, useMemo, useRef, useState } from "react";
import { Rich } from "../components/Rich";
import { UI } from "../i18n/ui";
import { answer, topicQuiz, type Quiz } from "../lib/quiz";
import { tx } from "../lib/text";
import { LANGS, type Lang } from "../lib/types";
import { QuizView } from "../site/QuizView";
import { humanError, type AdminApi, type Me, type SubjectRow, type TopicRow } from "./api";
import {
  canEdit, copyFromRu, fromRow, newForm, padOptions, publishProblems, readyIn, saveProblems,
  toPayload, toQuestion, type L3, type QuestionForm, type Status,
} from "./form";
import { nm, useT } from "./lang";
import type { AdminView } from "./route";
import { StepBar, type Nav } from "./Steps";

interface Props {
  api: AdminApi;
  me: Me;
  id: string | null; // null — новый вопрос
  topicId: string; // тема нового вопроса (у существующего — из базы)
  nav: Nav;
}

/** Сообщение после сохранения — ключ словаря, чтобы оно переводилось при смене языка. */
type Done = "saved" | "savedNext" | "sentReview" | "publishedMsg" | "returnedMsg" | "unpublishedMsg";

const blankForm = (topicId: string) => padOptions(newForm(topicId));

export function QuestionEditor({ api, me, id, topicId, nav }: Props) {
  const { lang: uiLang, t } = useT();
  const e = t.edit;
  const [form, setForm] = useState<QuestionForm | null>(id ? null : blankForm(topicId));
  const [saved, setSaved] = useState<string>(id ? "" : JSON.stringify(blankForm(topicId)));
  const [subject, setSubject] = useState<SubjectRow | null>(null);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [lang, setLang] = useState<Lang>("kk"); // язык текста вопроса (вкладка), не язык интерфейса
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [failure, setFailure] = useState<unknown>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [preview, setPreview] = useState(false);
  const [counter, setCounter] = useState<{ ready: number; min: number } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Загрузка вопроса, его темы и предмета (нужен язык языкового предмета и список тем для переноса).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const f = padOptions(id ? fromRow(await api.question(id)) : newForm(topicId));
        const tp = await api.topic(f.topicId);
        const [subs, list] = await Promise.all([api.subjects(), api.topics(tp.subject_id, tp.grade)]);
        if (!alive) return;
        const s = subs.find((x) => x.id === tp.subject_id) ?? null;
        setForm(f);
        setSaved(JSON.stringify(f));
        setSubject(s);
        setTopics(list);
        if (s?.only_lang) setLang(s.only_lang);
      } catch (err) {
        if (alive) setFailure(err);
      }
    })();
    return () => { alive = false; };
  }, [api, id, topicId]);

  const topic = form ? topics.find((x) => x.id === form.topicId) : undefined;

  // «Бұл тақырыпта: 2 / 5» — опубликованные вопросы, полные на языке админки (№88).
  const loadCounter = useMemo(() => async (tp: TopicRow) => {
    try {
      const [c, min] = await Promise.all([api.topicCounts(tp.grade, uiLang), api.topicMin()]);
      setCounter({ ready: c.find((x) => x.topic_id === tp.id)?.ready ?? 0, min });
    } catch { /* счётчик — подсказка, без него форма работает */ }
  }, [api, uiLang]);
  useEffect(() => { if (topic) loadCounter(topic); }, [topic, loadCounter]);

  const onlyLang = subject?.only_lang ?? null;
  const editable = form ? canEdit(form, me.role, me.id) : false;
  const dirty = form !== null && JSON.stringify(form) !== saved;

  useEffect(() => {
    if (!dirty) return;
    const warn = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const topicList: AdminView = { name: "topic", topicId: form?.topicId ?? topicId };
  const leave = (v: AdminView) => { if (!dirty || confirm(e.confirmLeave)) nav(v); };

  if (!form) {
    return (
      <div className="st-page">
        <StepBar step={3} nav={nav} />
        {failure ? <p className="error" role="alert">{humanError(failure, t)}</p> : <p className="loading">{t.loading}</p>}
      </div>
    );
  }

  const set = (p: Partial<QuestionForm>) => { setForm({ ...form, ...p }); setDone(null); };
  const setText = (field: "text" | "explanation", v: string) => set({ [field]: { ...form[field], [lang]: v } });
  const setOption = (i: number, p: Partial<{ text: L3; correct: boolean }>) =>
    set({ options: form.options.map((o, k) => (k === i ? { ...o, ...p } : o)) });
  const setCorrect = (i: number) => set({ options: form.options.map((o, k) => ({ ...o, correct: k === i })) });

  /** Проверки перед сохранением: вопрос написан, правильный ответ отмечен; для публикации и проверки — вопрос полный. */
  function check(status: Status): string[] {
    const list = saveProblems(form!, t);
    if (!form!.options.some((o) => o.correct)) list.push(t.problems.oneCorrect);
    // Сначала главное («Сұрақты жазыңыз», «Дұрыс жауапты белгілеңіз»), подробности — когда оно исправлено.
    if (list.length) return list;
    return status === "draft" ? [] : publishProblems(form!, onlyLang, t);
  }

  async function save(status: Status, message: Done = "saved", next = false) {
    const list = check(status);
    setProblems(list);
    setFailure(null);
    if (list.length) { setDone(null); return; }
    setBusy(true);
    try {
      const newId = await api.saveQuestion(toPayload(form!, status));
      if (next) {
        // Сразу пустая форма для следующего вопроса той же темы.
        const f = blankForm(form!.topicId);
        setForm(f);
        setSaved(JSON.stringify(f));
        textRef.current?.focus();
      } else {
        const f = padOptions(fromRow(await api.question(newId)));
        setForm(f);
        setSaved(JSON.stringify(f));
        if (!form!.id) history.replaceState(history.state, "", `/admin/questions/q/${newId}`);
      }
      setDone(message);
      if (topic) loadCounter(topic);
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!form!.id || !confirm(e.confirmDelete)) return;
    setBusy(true);
    try {
      await api.deleteQuestion(form!.id);
      nav(topicList, true);
    } catch (err) {
      setFailure(err);
      setBusy(false);
    }
  }

  // Пометку снимаем отдельно от сохранения: несохранённые правки формы остаются как есть.
  async function clearCheck() {
    setBusy(true);
    try {
      await api.clearTeacherCheck(form!.id!);
      setForm({ ...form!, teacherCheck: "" });
      setSaved(JSON.stringify({ ...JSON.parse(saved), teacherCheck: "" }));
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      set({ imageUrl: await api.uploadImage(file) });
    } catch (err) {
      setFailure(err);
    } finally {
      setBusy(false);
    }
  }

  const isAdmin = me.role === "admin";
  const st = form.status;
  const isNew = form.id === null;
  const langs = onlyLang ? [onlyLang] : LANGS;
  const L = lang.toUpperCase();
  // Точка на вкладке: язык начали заполнять, но не до конца.
  const started = (l: Lang) => Boolean(form.text[l].trim()) || form.options.some((o) => o.text[l].trim());
  const incomplete = (l: Lang) => started(l) && !readyIn({ ...form, options: form.options.filter((o) => LANGS.some((x) => o.text[x].trim())) }, l);
  const errors = failure ? [...problems, humanError(failure, t)] : problems;
  // Учитель удаляет свой неопубликованный вопрос, админ — любой (№89).
  const canDelete = !isNew && (isAdmin || editable);
  const topicsView: AdminView | undefined = subject && topic ? { name: "topics", slug: subject.slug, grade: topic.grade } : undefined;

  return (
    <div className="st-page st-editor">
      <StepBar step={3} nav={nav} topics={topicsView} />
      <a className="st-back" href={`/admin/questions/topic/${form.topicId}`}
        onClick={(ev) => { ev.preventDefault(); leave(topicList); }}>
        {t.steps.topicBack(topic ? nm(topic, "title", uiLang) : "")}
      </a>
      <h1>{isNew ? e.newQuestion : e.question} {!isNew && <span className={`st ${st === "draft" && form.reviewComment ? "returned" : st}`}>
        {st === "draft" && form.reviewComment ? t.steps.returned : t.status[st]}</span>}</h1>

      {!editable && <p className="note">{st === "published" ? e.readOnlyPublished : e.readOnlyOther}</p>}
      {form.reviewComment && !isAdmin && <p className="note"><b>{e.returned}</b> {form.reviewComment}</p>}
      {form.teacherCheck && (
        <p className="note"><b>{e.teacherCheck}</b> {form.teacherCheck}{" "}
          {isAdmin && <button type="button" className="link" disabled={busy} onClick={clearCheck}>{e.clearCheck}</button>}
        </p>
      )}

      {/* Вкладки языков вне fieldset: смотреть другие языки можно и без права правки */}
      <div className="st-tabs" role="tablist" aria-label={e.tabs}>
        {langs.map((l) => (
          <button key={l} type="button" role="tab" aria-selected={l === lang} onClick={() => setLang(l)}>
            {onlyLang ? e.langOnly[l] : e.langTab[l]}{incomplete(l) && <span className="dot" title={e.incomplete} />}
          </button>
        ))}
        {lang !== "ru" && !onlyLang && form.text.ru.trim() && (
          <button type="button" className="link" disabled={!editable || busy} onClick={() => set(copyFromRu(form, lang))}>
            {e.copyRu}
          </button>
        )}
      </div>

      <fieldset disabled={!editable || busy} className="st-card">
        <label className="st-field">{e.questionLabel}
          <textarea ref={textRef} rows={3} value={form.text[lang]} aria-label={e.text(L)}
            onChange={(ev) => setText("text", ev.target.value)} />
        </label>
        <p className="hint">{e.hint[0]} <code>{"\\( x^2 \\)"}</code> {e.hint[1]} <code>{"\\[ \\frac{a}{b} \\]"}</code> {e.hint[2]}</p>

        <div className="st-label"><b>{e.answers}</b> {e.answersHint}</div>
        <ol className="st-opts">
          {form.options.map((o, i) => (
            <li key={i} className={o.correct ? "on" : undefined}>
              <input type="radio" name="correct" checked={o.correct} onChange={() => setCorrect(i)}
                aria-label={e.optCorrect("ABCD"[i])} />
              <input value={o.text[lang]} aria-label={e.optInput("ABCD"[i], L)}
                placeholder={i === 3 ? `${e.answerN(i + 1)} (${e.optionalAnswer})` : e.answerN(i + 1)}
                onChange={(ev) => setOption(i, { text: { ...o.text, [lang]: ev.target.value } })} />
              {o.correct && <span className="tag">{e.correctTag}</span>}
            </li>
          ))}
        </ol>

        <label className="st-field">{e.explanationLabel}
          <span className="hint">{e.explanationHint}</span>
          <textarea rows={2} value={form.explanation[lang]} aria-label={e.explanation(L)}
            onChange={(ev) => setText("explanation", ev.target.value)} />
        </label>
      </fieldset>

      {errors.length > 0 && <div className="error" role="alert"><ul>{errors.map((p) => <li key={p}>{p}</li>)}</ul></div>}
      {done && <p className="ok-msg" role="status">{done === "saved" ? t.saved : e[done]}</p>}

      {editable && (
        <div className="st-actions">
          {isAdmin ? (
            <>
              {isNew && <button type="button" className="btn" disabled={busy} onClick={() => save("published", "savedNext", true)}>{e.saveNext}</button>}
              <button type="button" className={isNew ? "btn ghost" : "btn"} disabled={busy}
                onClick={() => save("published", "publishedMsg")}>{busy ? t.saving : t.save}</button>
            </>
          ) : (
            <>
              {isNew
                ? <button type="button" className="btn" disabled={busy} onClick={() => save("draft", "savedNext", true)}>{e.saveNext}</button>
                : <button type="button" className="btn" disabled={busy} onClick={() => save(st)}>{busy ? t.saving : t.save}</button>}
              {st === "draft" && (
                <button type="button" className="btn ghost" disabled={busy} onClick={() => save("review", "sentReview")}>{e.sendReview}</button>
              )}
            </>
          )}
          {counter && <span className="st-count">{t.steps.inTopic(counter.ready, counter.min)}</span>}
        </div>
      )}

      <details className="st-more-box">
        <summary>{e.more} ▾</summary>
        <fieldset disabled={!editable || busy} className="st-card">
          <label className="st-field">{e.topic}
            <select value={form.topicId} onChange={(ev) => set({ topicId: ev.target.value })}>
              {topics.map((x) => <option key={x.id} value={x.id}>{nm(x, "title", uiLang)}</option>)}
            </select>
          </label>
          <div className="st-row">
            <label className="st-field">{e.difficulty}
              <select value={form.difficulty} onChange={(ev) => set({ difficulty: +ev.target.value })}>
                {e.diffs.map((d, i) => <option key={i} value={i + 1}>{d}</option>)}
              </select>
            </label>
            <label className="st-field">{e.image}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(ev) => upload(ev.target.files?.[0])} />
            </label>
          </div>
          {form.imageUrl && (
            <div className="adm-img">
              <img src={form.imageUrl} alt={e.imageAlt} />
              <button type="button" className="link danger" onClick={() => set({ imageUrl: null })}>{e.removeImage}</button>
            </div>
          )}
          {isAdmin && (st === "review" || form.reviewComment) && (
            <label className="st-field">{e.commentForTeacher}
              <textarea rows={2} value={form.reviewComment} onChange={(ev) => set({ reviewComment: ev.target.value })} />
            </label>
          )}
        </fieldset>
        {editable && (
          <div className="st-actions">
            {isAdmin && st === "review" && (
              <button type="button" className="btn ghost" disabled={busy || !form.reviewComment.trim()}
                title={e.returnTitle} onClick={() => save("draft", "returnedMsg")}>{e.returnBtn}</button>
            )}
            {isAdmin && (
              <button type="button" className="btn ghost" disabled={busy}
                onClick={() => save("draft", st === "published" ? "unpublishedMsg" : "saved")}>
                {st === "published" ? e.unpublish : e.saveDraft}
              </button>
            )}
            {canDelete && <button type="button" className="btn ghost danger" disabled={busy} onClick={remove}>{e.deleteBtn}</button>}
          </div>
        )}
        <div className="adm-preview">
          <button type="button" className="link" aria-expanded={preview} onClick={() => setPreview(!preview)}>
            {preview ? e.previewHide : e.previewShow}
          </button>
          {preview && <Preview form={form} subject={subject} topic={topic} label={e.previewLang} />}
        </div>
      </details>
    </div>
  );
}

// Варианты в предпросмотре не перемешиваются: так легче сверять с формой.
const keepOrder = () => 0.9999;

function Preview({ form, subject, topic, label }: {
  form: QuestionForm;
  subject: SubjectRow | null;
  topic?: TopicRow;
  label: string;
}) {
  const [lang, setLang] = useState<Lang>(subject?.only_lang ?? "kk");
  const question = useMemo(() => toQuestion({ ...form, options: form.options.filter((o) => LANGS.some((l) => o.text[l].trim())) }), [form]);
  const [quiz, setQuiz] = useState<Quiz>(() => topicQuiz(form.topicId, [question], keepOrder));
  useEffect(() => setQuiz(topicQuiz(form.topicId, [question], keepOrder)), [form.topicId, question]);
  const explanation = question.explanation ? tx(question.explanation, lang) : "";

  return (
    <div className="adm-preview-box">
      <div className="langs" role="group" aria-label={label}>
        {LANGS.map((l) => (
          <button key={l} type="button" aria-pressed={l === lang} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
        ))}
      </div>
      <QuizView quiz={quiz} index={0} lang={lang} t={UI[lang]}
        heading={`${subject ? nm(subject, "name", lang) : ""} · ${topic ? nm(topic, "title", lang) : ""}`}
        onBack={() => {}} onPick={(j) => setQuiz((q) => answer(q, 0, j))}
        onNext={() => setQuiz(topicQuiz(form.topicId, [question], keepOrder))} />
      {quiz.answers[0] !== null && explanation && (
        <p className="note"><Rich text={explanation} /></p>
      )}
    </div>
  );
}
