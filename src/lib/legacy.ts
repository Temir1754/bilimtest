// Старый формат data/*.json: проверка (как в legacy/build.py) и перевод в модель сайта.
// Используется сайтом (этап 2) и скриптом импорта в Supabase (этап 3).
import { LANGS, type Lang, type Question, type Subject, type Text, type Topic } from "./types";

export type RawText = string | [string, string, string];
export type RawQuestion = RawText[]; // [вопрос, правильный, неверный1, неверный2, (неверный3)]
export type RawTopic = [RawText, RawQuestion[]];
export interface RawSubject {
  id: string;
  icon: string;
  name: RawText;
  lang?: Lang;
  grades: Record<string, RawTopic[]>;
}

/** Порядок предметов на сайте — как в старом build.py. */
export const SUBJECT_ORDER = ["math", "algebra", "geometry", "worldknow", "science", "physics", "chemistry",
  "biology", "geography", "histkz", "worldhist", "informatics", "kazakh", "kazlit", "russian", "english"];

function isText(v: unknown): v is RawText {
  if (typeof v === "string") return v.trim() !== "";
  return Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "string" && x.trim() !== "");
}

export function toText(v: RawText): Text {
  return typeof v === "string" ? { kk: v, ru: v, en: v } : { kk: v[0], ru: v[1], en: v[2] };
}

/** Возвращает список ошибок; пустой список — файл в порядке. */
export function validateSubject(fileId: string, s: RawSubject): string[] {
  const errors: string[] = [];
  if (s.id !== fileId) errors.push(`${fileId}: id mismatch`);
  if (!isText(s.name)) errors.push(`${fileId}: bad name`);
  for (const [g, topics] of Object.entries(s.grades ?? {})) {
    if (!(+g >= 4 && +g <= 11)) errors.push(`${fileId}: grade ${g}`);
    topics.forEach(([title, qs], ti) => {
      const where = `${fileId} ${g} #${ti + 1}`;
      if (!isText(title)) errors.push(`${where}: bad title`);
      if (qs.length < 5) errors.push(`${where}: only ${qs.length} questions`);
      qs.forEach((q, qi) => {
        const w = `${where} q${qi + 1}`;
        if (q.length < 4 || q.length > 5) { errors.push(`${w}: needs 3-4 options`); return; }
        if (!q.every(isText)) { errors.push(`${w}: bad text`); return; }
        LANGS.forEach((lang) => {
          const opts = q.slice(1).map((o) => toText(o)[lang]);
          if (new Set(opts).size !== opts.length) errors.push(`${w}: duplicate options (${lang})`);
        });
      });
    });
  }
  return errors;
}

export const topicKey = (sid: string, grade: number | string, ti: number) => `${sid}|${grade}|${ti}`;
export const questionKey = (sid: string, grade: number | string, ti: number, qi: number) =>
  `${sid}|${grade}|${ti}|${qi}`;

/** Переводит один файл предмета в модель сайта. id тем и вопросов — их legacy_key. */
export function convertSubject(s: RawSubject, sort: number) {
  const subject: Subject = { id: s.id, icon: s.icon, name: toText(s.name), onlyLang: s.lang ?? null, sort };
  const topics: Topic[] = [];
  const questions: Question[] = [];
  for (const [g, list] of Object.entries(s.grades)) {
    list.forEach(([title, qs], ti) => {
      const topicId = topicKey(s.id, g, ti);
      topics.push({ id: topicId, subjectId: s.id, grade: +g, title: toText(title), sort: ti, questionCount: qs.length });
      qs.forEach((q, qi) => {
        questions.push({
          id: questionKey(s.id, g, ti, qi),
          topicId,
          text: toText(q[0]),
          explanation: null,
          imageUrl: null,
          options: q.slice(1).map((o, j) => ({ text: toText(o), correct: j === 0 })),
        });
      });
    });
  }
  return { subject, topics, questions };
}

export function sortIndex(id: string) {
  const i = SUBJECT_ORDER.indexOf(id);
  return i < 0 ? SUBJECT_ORDER.length : i;
}
