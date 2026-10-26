// Форма вопроса в админке: перевод строк базы в форму и обратно, проверки перед сохранением.
// Без React — легко тестировать.
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
}

const l3 = (row: object, prefix: string): L3 => {
  const r = row as Record<string, string | null>;
  return { kk: r[`${prefix}_kk`] ?? "", ru: r[`${prefix}_ru`] ?? "", en: r[`${prefix}_en`] ?? "" };
};

/** Новый вопрос: 4 пустых варианта, первый — правильный. */
export function newForm(topicId: string): QuestionForm {
  return {
    id: null, topicId, text: empty3(), explanation: empty3(),
    options: [0, 1, 2, 3].map((i) => ({ text: empty3(), correct: i === 0 })),
    imageUrl: null, difficulty: 2, status: "draft", reviewComment: "", authorId: null,
  };
}

export function fromRow(row: QuestionRow): QuestionForm {
  return {
    id: row.id, topicId: row.topic_id, text: l3(row, "text"), explanation: l3(row, "explanation"),
    options: row.options.slice().sort((a, b) => a.sort_order - b.sort_order)
      .map((o) => ({ text: l3(o, "text"), correct: o.is_correct })),
    imageUrl: row.image_url, difficulty: row.difficulty, status: row.status,
    reviewComment: row.review_comment ?? "", authorId: row.author_id,
  };
}

const orNull = (s: string) => (s.trim() ? s.trim() : null);

/** Аргументы функции базы save_question. */
export function toPayload(f: QuestionForm, status: Status) {
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

/** Языки, на которых вопрос обязан быть: у языкового предмета — один, у остальных — все три. */
export const requiredLangs = (onlyLang: Lang | null): Lang[] => (onlyLang ? [onlyLang] : [...LANGS]);

const LANG_NAME: L3 = { kk: "казахском", ru: "русском", en: "английском" };

/**
 * Что мешает опубликовать вопрос. Те же правила, что проверяет база (assert_question_publishable),
 * но с понятными сообщениями до отправки.
 */
export function publishProblems(f: QuestionForm, onlyLang: Lang | null): string[] {
  const out: string[] = [];
  const n = f.options.length;
  if (n < 3 || n > 4) out.push(`Нужно 3 или 4 варианта ответа, сейчас ${n}.`);
  const nCorrect = f.options.filter((o) => o.correct).length;
  if (nCorrect !== 1) out.push("Отметьте ровно один правильный ответ.");
  for (const l of requiredLangs(onlyLang)) {
    if (!f.text[l].trim()) out.push(`Нет текста вопроса на ${LANG_NAME[l]} языке.`);
    const missing = f.options.map((o, i) => (o.text[l].trim() ? null : "ABCD"[i])).filter(Boolean);
    if (missing.length) out.push(`Нет текста варианта ${missing.join(", ")} на ${LANG_NAME[l]} языке.`);
  }
  return out;
}

/** Что мешает сохранить вообще (даже черновик). */
export function saveProblems(f: QuestionForm): string[] {
  const out: string[] = [];
  if (!f.topicId) out.push("Выберите тему.");
  if (f.options.length > 4) out.push("Не больше 4 вариантов ответа.");
  if (!LANGS.some((l) => f.text[l].trim())) out.push("Напишите текст вопроса хотя бы на одном языке.");
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
export function canEdit(f: QuestionForm, role: Role, userId: string): boolean {
  if (role === "admin") return true;
  if (role !== "teacher") return false;
  return f.id === null || (f.authorId === userId && f.status !== "published");
}

export const STATUS_LABEL: Record<Status, string> = {
  draft: "Черновик", review: "На проверке", published: "Опубликован",
};
