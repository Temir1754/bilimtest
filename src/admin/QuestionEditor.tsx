import { useEffect, useMemo, useState } from "react";
import { Rich } from "../components/Rich";
import { UI } from "../i18n/ui";
import { answer, topicQuiz, type Quiz } from "../lib/quiz";
import { tx } from "../lib/text";
import { LANGS, type Lang } from "../lib/types";
import { QuizView } from "../site/QuizView";
import { humanError, type AdminApi, type Me, type SubjectRow, type TopicRow } from "./api";
import {
  canEdit, copyFromRu, empty3, fromRow, newForm, publishProblems, requiredLangs, saveProblems,
  toPayload, toQuestion, type L3, type QuestionForm, type Status,
} from "./form";
import { nm, useT } from "./lang";

interface Props {
  api: AdminApi;
  me: Me;
  id: string | null; // null — новый вопрос
  topicId: string;
  onClose: () => void;
}

/** Сообщение после сохранения — ключ словаря, чтобы оно переводилось при смене языка. */
type Done = "saved" | "sentReview" | "publishedMsg" | "returnedMsg" | "unpublishedMsg";

export function QuestionEditor({ api, me, id, topicId, onClose }: Props) {
  const { lang: uiLang, t } = useT();
  const e = t.edit;
  const [form, setForm] = useState<QuestionForm | null>(id ? null : newForm(topicId));
  const [saved, setSaved] = useState<string>(id ? "" : JSON.stringify(newForm(topicId)));
  const [subject, setSubject] = useState<SubjectRow | null>(null);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [lang, setLang] = useState<Lang>("kk"); // язык текста вопроса (вкладка), не язык интерфейса
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [failure, setFailure] = useState<unknown>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [preview, setPreview] = useState(false);

  // Загрузка вопроса, его темы и предмета (нужен язык языкового предмета и список тем для переноса).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const f = id ? fromRow(await api.question(id)) : newForm(topicId);
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

  const onlyLang = subject?.only_lang ?? null;
  const editable = form ? canEdit(form, me.role, me.id) : false;
  const dirty = form !== null && JSON.stringify(form) !== saved;
  const ready = useMemo(() => (form ? publishProblems(form, onlyLang, t) : []), [form, onlyLang, t]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (!form) {
    return failure
      ? <><button type="button" className="back" onClick={onClose}>{e.back}</button><p className="error">{humanError(failure, t)}</p></>
      : <p className="loading">{t.loading}</p>;
  }

  const set = (p: Partial<QuestionForm>) => { setForm({ ...form, ...p }); setDone(null); };
  const setText = (field: "text" | "explanation", v: string) => set({ [field]: { ...form[field], [lang]: v } });
  const setOption = (i: number, p: Partial<{ text: L3; correct: boolean }>) =>
    set({ options: form.options.map((o, k) => (k === i ? { ...o, ...p } : o)) });
  const setCorrect = (i: number) => set({ options: form.options.map((o, k) => ({ ...o, correct: k === i })) });

  function close() {
    if (dirty && !confirm(e.confirmLeave)) return;
    onClose();
  }

  async function save(status: Status, message: Done = "saved") {
    const list = saveProblems(form!, t);
    if (status === "published") list.push(...publishProblems(form!, onlyLang, t));
    setProblems(list);
    setFailure(null);
    if (list.length) return;
    setBusy(true);
    try {
      const newId = await api.saveQuestion(toPayload(form!, status));
      const f = fromRow(await api.question(newId));
      setForm(f);
      setSaved(JSON.stringify(f));
      setDone(message);
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
      onClose();
    } catch (err) {
      setFailure(err);
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
  const topic = topics.find((x) => x.id === form.topicId);
  const langs = onlyLang ? [onlyLang] : LANGS;
  const L = lang.toUpperCase();
  const incomplete = (l: Lang) => requiredLangs(onlyLang).includes(l) &&
    (!form.text[l].trim() || form.options.some((o) => !o.text[l].trim()));
  const errors = failure ? [...problems, humanError(failure, t)] : problems;

  return (
    <div className="adm-editor">
      <button type="button" className="back" onClick={close}>{e.back}</button>
      <div className="adm-head">
        <div>
          <div className="kicker">{subject ? `${subject.icon} ${nm(subject, "name", uiLang)}` : ""}{topic ? ` · ${e.grade(topic.grade)}` : ""}</div>
          <h2>{form.id ? e.question : e.newQuestion} <span className={`st ${st}`}>{t.status[st]}</span></h2>
        </div>
      </div>

      {!editable && <p className="note">{st === "published" ? e.readOnlyPublished : e.readOnlyOther}</p>}
      {form.reviewComment && !isAdmin && (
        <p className="note"><b>{e.reviewComment}</b> {form.reviewComment}</p>
      )}

      <fieldset disabled={!editable || busy} className="adm-form">
        <label>{e.topic}
          <select value={form.topicId} onChange={(ev) => set({ topicId: ev.target.value })}>
            {topics.map((x) => <option key={x.id} value={x.id}>{nm(x, "title", uiLang)}</option>)}
          </select>
        </label>
      </fieldset>

      {/* Вкладки языков вне fieldset: смотреть другие языки можно и без права правки */}
      <div className="adm-tabs" role="tablist" aria-label={e.tabs}>
        {langs.map((l) => (
          <button key={l} type="button" role="tab" aria-selected={l === lang} onClick={() => setLang(l)}>
            {l.toUpperCase()}{incomplete(l) && <span className="dot" title={e.incomplete} />}
          </button>
        ))}
        {onlyLang && <span className="muted">{e.onlyLang(onlyLang.toUpperCase())}</span>}
        {lang !== "ru" && !onlyLang && (
          <button type="button" className="link" disabled={!editable || busy} onClick={() => set(copyFromRu(form, lang))}>
            {e.copyRu}
          </button>
        )}
      </div>

      <fieldset disabled={!editable || busy} className="adm-form">
        <label>{e.text(L)}
          <textarea rows={3} value={form.text[lang]} onChange={(ev) => setText("text", ev.target.value)} />
        </label>
        <p className="hint">{e.hint[0]} <code>{"\\( x^2 \\)"}</code> {e.hint[1]} <code>{"\\[ \\frac{a}{b} \\]"}</code> {e.hint[2]}</p>

        <div className="label">{e.options}</div>
        <ol className="adm-opts">
          {form.options.map((o, i) => (
            <li key={i}>
              <input type="radio" name="correct" checked={o.correct} onChange={() => setCorrect(i)}
                aria-label={e.optCorrect("ABCD"[i])} />
              <span className="k">{"ABCD"[i]}</span>
              <input value={o.text[lang]} aria-label={e.optInput("ABCD"[i], L)}
                onChange={(ev) => setOption(i, { text: { ...o.text, [lang]: ev.target.value } })} />
              <button type="button" className="link danger" aria-label={e.optRemove("ABCD"[i])}
                disabled={form.options.length <= 2} onClick={() => set({ options: form.options.filter((_, k) => k !== i) })}>
                ×
              </button>
            </li>
          ))}
        </ol>
        {form.options.length < 4 && (
          <button type="button" className="link"
            onClick={() => set({ options: [...form.options, { text: empty3(), correct: false }] })}>
            {e.addOption}
          </button>
        )}

        <label>{e.explanation(L)}
          <textarea rows={2} value={form.explanation[lang]} onChange={(ev) => setText("explanation", ev.target.value)} />
        </label>

        <div className="adm-row grow">
          <label>{e.difficulty}
            <select value={form.difficulty} onChange={(ev) => set({ difficulty: +ev.target.value })}>
              {e.diffs.map((d, i) => <option key={i} value={i + 1}>{d}</option>)}
            </select>
          </label>
          <label>{e.image}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(ev) => upload(ev.target.files?.[0])} />
          </label>
        </div>
        {form.imageUrl && (
          <div className="adm-img">
            <img src={form.imageUrl} alt={e.imageAlt} />
            <button type="button" className="link danger" onClick={() => set({ imageUrl: null })}>{e.removeImage}</button>
          </div>
        )}

        {isAdmin && (st === "review" || form.reviewComment) && (
          <label>{e.commentForTeacher}
            <textarea rows={2} value={form.reviewComment} onChange={(ev) => set({ reviewComment: ev.target.value })} />
          </label>
        )}
      </fieldset>

      {ready.length > 0 && (
        <div className="adm-ready">
          <b>{e.beforePublish}</b>
          <ul>{ready.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      {errors.length > 0 && <div className="error" role="alert"><ul>{errors.map((p) => <li key={p}>{p}</li>)}</ul></div>}
      {done && <p className="ok-msg" role="status">{done === "saved" ? t.saved : e[done]}</p>}

      {editable && (
        <div className="actions">
          <button type="button" className="btn" disabled={busy} onClick={() => save(st)}>
            {busy ? t.saving : t.save}
          </button>
          {!isAdmin && st === "draft" && (
            <button type="button" className="btn ghost" disabled={busy}
              onClick={() => save("review", "sentReview")}>{e.sendReview}</button>
          )}
          {isAdmin && st !== "published" && (
            <button type="button" className="btn ghost" disabled={busy}
              onClick={() => save("published", "publishedMsg")}>{e.publish}</button>
          )}
          {isAdmin && st === "review" && (
            <button type="button" className="btn ghost" disabled={busy || !form.reviewComment.trim()}
              title={e.returnTitle} onClick={() => save("draft", "returnedMsg")}>{e.returnBtn}</button>
          )}
          {isAdmin && st === "published" && (
            <button type="button" className="btn ghost" disabled={busy}
              onClick={() => save("draft", "unpublishedMsg")}>{e.unpublish}</button>
          )}
          {isAdmin && form.id && (
            <button type="button" className="btn ghost danger" disabled={busy} onClick={remove}>{e.deleteBtn}</button>
          )}
        </div>
      )}

      <div className="adm-preview">
        <button type="button" className="link" aria-expanded={preview} onClick={() => setPreview(!preview)}>
          {preview ? e.previewHide : e.previewShow}
        </button>
        {preview && <Preview form={form} subject={subject} topic={topic} label={e.previewLang} />}
      </div>
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
  const question = useMemo(() => toQuestion(form), [form]);
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
