import { useEffect, useMemo, useState } from "react";
import { Rich } from "../components/Rich";
import { UI } from "../i18n/ui";
import { answer, topicQuiz, type Quiz } from "../lib/quiz";
import { tx } from "../lib/text";
import { LANGS, type Lang } from "../lib/types";
import { QuizView } from "../site/QuizView";
import { humanError, type AdminApi, type Me, type SubjectRow, type TopicRow } from "./api";
import { ru } from "./Browser";
import {
  STATUS_LABEL, canEdit, copyFromRu, empty3, fromRow, newForm, publishProblems, requiredLangs, saveProblems,
  toPayload, toQuestion, type L3, type QuestionForm, type Status,
} from "./form";

interface Props {
  api: AdminApi;
  me: Me;
  id: string | null; // null — новый вопрос
  topicId: string;
  onClose: () => void;
}

const DIFFICULTY = ["лёгкий", "средний", "сложный"];

export function QuestionEditor({ api, me, id, topicId, onClose }: Props) {
  const [form, setForm] = useState<QuestionForm | null>(id ? null : newForm(topicId));
  const [saved, setSaved] = useState<string>(id ? "" : JSON.stringify(newForm(topicId)));
  const [subject, setSubject] = useState<SubjectRow | null>(null);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [lang, setLang] = useState<Lang>("kk");
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(false);

  // Загрузка вопроса, его темы и предмета (нужен язык языкового предмета и список тем для переноса).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const f = id ? fromRow(await api.question(id)) : newForm(topicId);
        const t = await api.topic(f.topicId);
        const [subs, list] = await Promise.all([api.subjects(), api.topics(t.subject_id, t.grade)]);
        if (!alive) return;
        const s = subs.find((x) => x.id === t.subject_id) ?? null;
        setForm(f);
        setSaved(JSON.stringify(f));
        setSubject(s);
        setTopics(list);
        if (s?.only_lang) setLang(s.only_lang);
      } catch (e) {
        if (alive) setProblems([humanError(e)]);
      }
    })();
    return () => { alive = false; };
  }, [api, id, topicId]);

  const onlyLang = subject?.only_lang ?? null;
  const editable = form ? canEdit(form, me.role, me.id) : false;
  const dirty = form !== null && JSON.stringify(form) !== saved;
  const ready = useMemo(() => (form ? publishProblems(form, onlyLang) : []), [form, onlyLang]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (!form) {
    return problems.length
      ? <><button type="button" className="back" onClick={onClose}>← К списку</button><p className="error">{problems[0]}</p></>
      : <p className="loading">Загрузка…</p>;
  }

  const set = (p: Partial<QuestionForm>) => { setForm({ ...form, ...p }); setMessage(""); };
  const setText = (field: "text" | "explanation", v: string) => set({ [field]: { ...form[field], [lang]: v } });
  const setOption = (i: number, p: Partial<{ text: L3; correct: boolean }>) =>
    set({ options: form.options.map((o, k) => (k === i ? { ...o, ...p } : o)) });
  const setCorrect = (i: number) => set({ options: form.options.map((o, k) => ({ ...o, correct: k === i })) });

  function close() {
    if (dirty && !confirm("Есть несохранённые изменения. Закрыть без сохранения?")) return;
    onClose();
  }

  async function save(status: Status, done = "Сохранено.") {
    const list = saveProblems(form!);
    if (status === "published") list.push(...publishProblems(form!, onlyLang));
    setProblems(list);
    if (list.length) return;
    setBusy(true);
    try {
      const newId = await api.saveQuestion(toPayload(form!, status));
      const f = fromRow(await api.question(newId));
      setForm(f);
      setSaved(JSON.stringify(f));
      setMessage(done);
    } catch (e) {
      setProblems([humanError(e)]);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!form!.id || !confirm("Удалить вопрос навсегда? Это нельзя отменить.")) return;
    setBusy(true);
    try {
      await api.deleteQuestion(form!.id);
      onClose();
    } catch (e) {
      setProblems([humanError(e)]);
      setBusy(false);
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      set({ imageUrl: await api.uploadImage(file) });
    } catch (e) {
      setProblems([humanError(e)]);
    } finally {
      setBusy(false);
    }
  }

  const isAdmin = me.role === "admin";
  const st = form.status;
  const topic = topics.find((t) => t.id === form.topicId);
  const langs = onlyLang ? [onlyLang] : LANGS;
  const incomplete = (l: Lang) => requiredLangs(onlyLang).includes(l) &&
    (!form.text[l].trim() || form.options.some((o) => !o.text[l].trim()));

  return (
    <div className="adm-editor">
      <button type="button" className="back" onClick={close}>← К списку</button>
      <div className="adm-head">
        <div>
          <div className="kicker">{subject ? `${subject.icon} ${ru(subject, "name")}` : ""}{topic ? ` · ${topic.grade} класс` : ""}</div>
          <h2>{form.id ? "Вопрос" : "Новый вопрос"} <span className={`st ${st}`}>{STATUS_LABEL[st]}</span></h2>
        </div>
      </div>

      {!editable && (
        <p className="note">
          {st === "published" ? "Опубликованный вопрос может менять только админ. Если нашли ошибку — напишите админу."
            : "Это вопрос другого учителя, его нельзя менять."}
        </p>
      )}
      {form.reviewComment && !isAdmin && (
        <p className="note"><b>Комментарий проверки:</b> {form.reviewComment}</p>
      )}

      <fieldset disabled={!editable || busy} className="adm-form">
        <label>Тема
          <select value={form.topicId} onChange={(e) => set({ topicId: e.target.value })}>
            {topics.map((t) => <option key={t.id} value={t.id}>{ru(t, "title")}</option>)}
          </select>
        </label>
      </fieldset>

      {/* Вкладки языков вне fieldset: смотреть другие языки можно и без права правки */}
      <div className="adm-tabs" role="tablist" aria-label="Язык текста">
        {langs.map((l) => (
          <button key={l} type="button" role="tab" aria-selected={l === lang} onClick={() => setLang(l)}>
            {l.toUpperCase()}{incomplete(l) && <span className="dot" title="Заполнено не всё" />}
          </button>
        ))}
        {onlyLang && <span className="muted">Языковой предмет: вопросы только на {onlyLang.toUpperCase()}</span>}
        {lang !== "ru" && !onlyLang && (
          <button type="button" className="link" disabled={!editable || busy} onClick={() => set(copyFromRu(form, lang))}>
            Скопировать текст из русского
          </button>
        )}
      </div>

      <fieldset disabled={!editable || busy} className="adm-form">
        <label>Текст вопроса ({lang.toUpperCase()})
          <textarea rows={3} value={form.text[lang]} onChange={(e) => setText("text", e.target.value)} />
        </label>
        <p className="hint">Формулы: <code>{"\\( x^2 \\)"}</code> в строке, <code>{"\\[ \\frac{a}{b} \\]"}</code> отдельно.
          Всё после переноса строки показывается как блок кода.</p>

        <div className="label">Варианты ответа — отметьте правильный</div>
        <ol className="adm-opts">
          {form.options.map((o, i) => (
            <li key={i}>
              <input type="radio" name="correct" checked={o.correct} onChange={() => setCorrect(i)}
                aria-label={`Вариант ${"ABCD"[i]} правильный`} />
              <span className="k">{"ABCD"[i]}</span>
              <input value={o.text[lang]} aria-label={`Вариант ${"ABCD"[i]} (${lang.toUpperCase()})`}
                onChange={(e) => setOption(i, { text: { ...o.text, [lang]: e.target.value } })} />
              <button type="button" className="link danger" aria-label={`Удалить вариант ${"ABCD"[i]}`}
                disabled={form.options.length <= 2} onClick={() => set({ options: form.options.filter((_, k) => k !== i) })}>
                ×
              </button>
            </li>
          ))}
        </ol>
        {form.options.length < 4 && (
          <button type="button" className="link"
            onClick={() => set({ options: [...form.options, { text: empty3(), correct: false }] })}>
            + вариант
          </button>
        )}

        <label>Пояснение к правильному ответу ({lang.toUpperCase()}, необязательно)
          <textarea rows={2} value={form.explanation[lang]} onChange={(e) => setText("explanation", e.target.value)} />
        </label>

        <div className="adm-row wrap">
          <label>Сложность
            <select value={form.difficulty} onChange={(e) => set({ difficulty: +e.target.value })}>
              {DIFFICULTY.map((d, i) => <option key={i} value={i + 1}>{d}</option>)}
            </select>
          </label>
          <label>Картинка (PNG, JPG, WebP, GIF, до 2 МБ)
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        </div>
        {form.imageUrl && (
          <div className="adm-img">
            <img src={form.imageUrl} alt="Картинка вопроса" />
            <button type="button" className="link danger" onClick={() => set({ imageUrl: null })}>убрать картинку</button>
          </div>
        )}

        {isAdmin && (st === "review" || form.reviewComment) && (
          <label>Комментарий для учителя (если возвращаете на доработку)
            <textarea rows={2} value={form.reviewComment} onChange={(e) => set({ reviewComment: e.target.value })} />
          </label>
        )}
      </fieldset>

      {ready.length > 0 && (
        <div className="adm-ready">
          <b>Перед публикацией нужно:</b>
          <ul>{ready.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      {problems.length > 0 && <div className="error" role="alert"><ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>}
      {message && <p className="ok-msg" role="status">{message}</p>}

      {editable && (
        <div className="actions">
          <button type="button" className="btn" disabled={busy} onClick={() => save(st)}>
            {busy ? "Сохранение…" : "Сохранить"}
          </button>
          {!isAdmin && st === "draft" && (
            <button type="button" className="btn ghost" disabled={busy}
              onClick={() => save("review", "Отправлено на проверку админу.")}>Отправить на проверку</button>
          )}
          {isAdmin && st !== "published" && (
            <button type="button" className="btn ghost" disabled={busy}
              onClick={() => save("published", "Опубликовано.")}>Опубликовать</button>
          )}
          {isAdmin && st === "review" && (
            <button type="button" className="btn ghost" disabled={busy || !form.reviewComment.trim()}
              title="Сначала напишите комментарий для учителя"
              onClick={() => save("draft", "Вопрос возвращён учителю на доработку.")}>Вернуть на доработку</button>
          )}
          {isAdmin && st === "published" && (
            <button type="button" className="btn ghost" disabled={busy}
              onClick={() => save("draft", "Снято с публикации, теперь это черновик.")}>Снять с публикации</button>
          )}
          {isAdmin && form.id && (
            <button type="button" className="btn ghost danger" disabled={busy} onClick={remove}>Удалить</button>
          )}
        </div>
      )}

      <div className="adm-preview">
        <button type="button" className="link" aria-expanded={preview} onClick={() => setPreview(!preview)}>
          {preview ? "▾ Скрыть предпросмотр" : "▸ Предпросмотр глазами ученика"}
        </button>
        {preview && <Preview form={form} subject={subject} topic={topic} />}
      </div>
    </div>
  );
}

// Варианты в предпросмотре не перемешиваются: так легче сверять с формой.
const keepOrder = () => 0.9999;

function Preview({ form, subject, topic }: { form: QuestionForm; subject: SubjectRow | null; topic?: TopicRow }) {
  const [lang, setLang] = useState<Lang>(subject?.only_lang ?? "kk");
  const question = useMemo(() => toQuestion(form), [form]);
  const [quiz, setQuiz] = useState<Quiz>(() => topicQuiz(form.topicId, [question], keepOrder));
  useEffect(() => setQuiz(topicQuiz(form.topicId, [question], keepOrder)), [form.topicId, question]);
  const t = UI[lang];
  const explanation = question.explanation ? tx(question.explanation, lang) : "";

  return (
    <div className="adm-preview-box">
      <div className="langs" role="group" aria-label="Язык предпросмотра">
        {LANGS.map((l) => (
          <button key={l} type="button" aria-pressed={l === lang} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
        ))}
      </div>
      <QuizView quiz={quiz} index={0} lang={lang} t={t}
        heading={`${subject ? tx({ kk: subject.name_kk, ru: subject.name_ru, en: subject.name_en }, lang) : ""} · ${
          topic ? tx({ kk: topic.title_kk, ru: topic.title_ru, en: topic.title_en }, lang) : ""}`}
        onBack={() => {}} onPick={(j) => setQuiz((q) => answer(q, 0, j))}
        onNext={() => setQuiz(topicQuiz(form.topicId, [question], keepOrder))} />
      {quiz.answers[0] !== null && explanation && (
        <p className="note"><Rich text={explanation} /></p>
      )}
    </div>
  );
}
