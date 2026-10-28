// Форма вопроса в админке: перевод строк базы в форму и обратно, проверки перед сохранением.
// Без React — легко тестировать.
import type { AdminText } from "../i18n/admin";
import { LANGS, type Lang, type Question } from "../lib/types";

export type Status = "draft" | "review" | "published";
export type Role = "student" | "teacher" | "admin";
export type L3 = Record<Lang, string>;

export const empty3 = (): L3 => ({ kk: "", ru: "", en: "" });

/** Строки таблиц questions и options в том виде, в каком их отдаёт Supabase. */
export interface OptionRow {
  id?: string;
  sort_order: number;
  is_correct: boolean;
  text_kk: string | null;
  text_ru: string | null;
  text_en: string | null;
}

export interface QuestionRow {
  id: string;
  topic_id: string;
  text_kk: string | null;
  text_ru: string | null;
  text_en: string | null;
  explanation_kk: string | null;
  explanation_ru: string | null;
  explanation_en: string | null;
  image_url: string | null;
  difficulty: number;
  status: Status;
  review_comment: string | null;
  author_id: string | null;
  teacher_check?: string | null; // «требует проверки учителем»: что проверить (DECISIONS.md №66)
  options: OptionRow[];
}

export interface FormOption {
  text: L3;
  correct: boolean;
}

export interface QuestionForm {
  id: string | null; // null — новый вопрос
  topicId: string;
  text: L3;
  explanation: L3;
  options: FormOption[];
  imageUrl: string | null;
  difficulty: number;
  status: Status;
  reviewComment: string;
  authorId: string | null;
  teacherCheck: string; // только показывается; снимает админ отдельной кнопкой
}

const l3 = (row: object, prefix: string): L3 => {
  const r = row as Record<string, string | null>;
  return { kk: r[`${prefix}_kk`] ?? "", ru: r[`${prefix}_ru`] ?? "", en: r[`${prefix}_en`] ?? "" };
};

/** Новый вопрос: 4 пустых варианта, правильный не отмечен — его отмечает автор (иначе легко забыть). */
export function newForm(topicId: string): QuestionForm {
  return {
    id: null, topicId, text: empty3(), explanation: empty3(),
    options: [0, 1, 2, 3].map(() => ({ text: empty3(), correct: false })),
    imageUrl: null, difficulty: 2, status: "draft", reviewComment: "", authorId: null, teacherCheck: "",
  };
}

export function fromRow(row: QuestionRow): QuestionForm {
  return {
    id: row.id, topicId: row.topic_id, text: l3(row, "text"), explanation: l3(row, "explanation"),
    options: row.options.slice().sort((a, b) => a.sort_order - b.sort_order)
      .map((o) => ({ text: l3(o, "text"), correct: o.is_correct })),
    imageUrl: row.image_url, difficulty: row.difficulty, status: row.status,
    reviewComment: row.review_comment ?? "", authorId: row.author_id, teacherCheck: row.teacher_check ?? "",
  };
}

const orNull = (s: string) => (s.trim() ? s.trim() : null);

const blank = (o: FormOption) => !LANGS.some((l) => o.text[l].trim());

/** Пустые строки ответов (4-й ответ необязателен) не сохраняются. */
export const dropEmpty = (f: QuestionForm): QuestionForm => ({ ...f, options: f.options.filter((o) => !blank(o)) });

/** В форме всегда 4 строки ответов: недостающие — пустые. */
export const padOptions = (f: QuestionForm): QuestionForm => ({
  ...f, options: [...f.options, ...Array.from({ length: Math.max(0, 4 - f.options.length) }, () => ({ text: empty3(), correct: false }))],
});

/** Полный ли вопрос на языке: текст и все варианты (то же, что question_ready_in в базе). */
export const readyIn = (f: QuestionForm, l: Lang) => Boolean(f.text[l].trim()) && f.options.every((o) => o.text[l].trim());

/** Аргументы функции базы save_question. Пустые строки ответов отбрасываются. */
export function toPayload(form: QuestionForm, status: Status) {
  const f = dropEmpty(form);
  const q: Record<string, unknown> = {
    topic_id: f.topicId, image_url: f.imageUrl, difficulty: f.difficulty, status,
    review_comment: orNull(f.reviewComment),
  };
  for (const l of LANGS) {
    q[`text_${l}`] = orNull(f.text[l]);
    q[`explanation_${l}`] = orNull(f.explanation[l]);
  }
  const options = f.options.map((o) => ({
    text_kk: orNull(o.text.kk), text_ru: orNull(o.text.ru), text_en: orNull(o.text.en), is_correct: o.correct,
  }));
  return { p_id: f.id, p_q: q, p_options: options };
}

/** Языки, которые нужно заполнить: у языкового предмета — его язык, у остальных — kk, ru, en (обязателен любой один, №88). */
export const requiredLangs = (onlyLang: Lang | null): Lang[] => (onlyLang ? [onlyLang] : [...LANGS]);

/**
 * Что мешает опубликовать вопрос. Те же правила, что проверяет база (assert_question_publishable, №88):
 * 3–4 варианта, один правильный, полный хотя бы на одном языке (у языкового предмета — на его языке).
 * Сообщения — на языке админки; если ни один язык не полный, подсказка — по языку, который начали заполнять.
 */
export function publishProblems(form: QuestionForm, onlyLang: Lang | null, t: AdminText): string[] {
  const f = dropEmpty(form);
  const p = t.problems;
  const out: string[] = [];
  const n = f.options.length;
  if (n < 3 || n > 4) out.push(p.optCount(n));
  const nCorrect = f.options.filter((o) => o.correct).length;
  if (nCorrect !== 1) out.push(p.oneCorrect);
  if (!onlyLang && LANGS.some((l) => readyIn(f, l))) return out;
  const main = onlyLang ?? LANGS.find((l) => f.text[l].trim()) ?? "kk";
  for (const l of [main]) {
    if (!f.text[l].trim()) out.push(p.noText(t.langIn[l]));
    const missing = f.options.map((o, i) => (o.text[l].trim() ? null : "ABCD"[i])).filter(Boolean);
    if (missing.length) out.push(p.noOptText(missing.join(", "), t.langIn[l]));
  }
  return out;
}

/** Что мешает сохранить вообще (даже черновик). */
export function saveProblems(f: QuestionForm, t: AdminText): string[] {
  const out: string[] = [];
  if (!f.topicId) out.push(t.problems.needTopic);
  if (f.options.length > 4) out.push(t.problems.max4);
  if (!LANGS.some((l) => f.text[l].trim())) out.push(t.problems.needText);
  return out;
}

/** «Скопировать текст из русского»: заполняет пустые поля языка lang русским текстом. */
export function copyFromRu(f: QuestionForm, lang: Lang): QuestionForm {
  const fill = (t: L3): L3 => (t[lang].trim() ? t : { ...t, [lang]: t.ru });
  return {
    ...f, text: fill(f.text), explanation: fill(f.explanation),
    options: f.options.map((o) => ({ ...o, text: fill(o.text) })),
  };
}

/** Вопрос в формате сайта ученика — для предпросмотра. */
export function toQuestion(f: QuestionForm): Question {
  const t = (x: L3) => ({ kk: x.kk.trim(), ru: x.ru.trim(), en: x.en.trim() });
  const ex = t(f.explanation);
  return {
    id: f.id ?? "new", topicId: f.topicId, text: t(f.text),
    explanation: ex.kk || ex.ru || ex.en ? ex : null, imageUrl: f.imageUrl,
    options: f.options.map((o) => ({ text: t(o.text), correct: o.correct })),
  };
}

/** Может ли пользователь менять вопрос (то же правило, что can_edit_question в базе). */
export function canEdit(f: QuestionForm, role: Role, userId: string, trusted = false): boolean {
  if (role === "admin") return true;
  if (role !== "teacher") return false;
  return f.id === null || (f.authorId === userId && (f.status !== "published" || trusted));
}
