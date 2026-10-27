// Вопросы из Word или из Excel со «своими» столбцами (DECISIONS.md №91): один язык, тема из файла, проверка строк.
// Таблица-предпросмотр правит эти строки, затем строки без ошибок уходят в import_questions с темой программы.
// Без React и без библиотек — легко тестировать.
import type { Lang } from "../lib/types";
import type { TopicRow } from "./api";

/** Тема из файла: «§1. Натурал сандар» → key "1". У файла без тем — одна тема с key "". */
export interface FileTopic {
  key: string;
  label: string; // «§1» или название из столбца Excel
  title: string;
}

/** Вопрос из файла. */
export interface Draft {
  id: string;
  topic: string; // FileTopic.key
  num: number | null; // номер в файле
  text: string;
  options: string[];
  correct: number | null;
  explanation?: string;
  keyLetter?: string; // буква из ключа, если такого варианта нет
  numbering?: { found: number; expected: number }; // нумерация сбита — ответ из ключа мог попасть не к тому вопросу
  checked?: boolean; // правильный ответ отмечен вручную — сомнение снято
}

export interface DraftSet {
  topics: FileTopic[];
  drafts: Draft[];
  noKey: boolean; // в файле не найден ключ ответов
}

export type Issue =
  | { code: "noText" } | { code: "tooFew" } | { code: "tooMany"; n: number } | { code: "noKey" }
  | { code: "keyOut"; letter: string } | { code: "numbering"; found: number; expected: number } | { code: "noTopic" };

const filled = (d: Draft) => d.options.filter((o) => o.trim());

/** Что мешает сохранить вопрос. Тему программы проверяет таблица (noTopic). */
export function issues(d: Draft): Issue[] {
  const out: Issue[] = [];
  const n = filled(d).length;
  if (!d.text.trim()) out.push({ code: "noText" });
  if (n < 3) out.push({ code: "tooFew" });
  if (n > 4) out.push({ code: "tooMany", n });
  if (d.correct === null || !d.options[d.correct]?.trim()) {
    out.push(d.keyLetter && d.correct === null ? { code: "keyOut", letter: d.keyLetter } : { code: "noKey" });
  } else if (d.numbering && !d.checked) {
    out.push({ code: "numbering", ...d.numbering });
  }
  return out;
}

/** Строки без ошибок → аргумент import_questions: тема программы по id, текст на языке lang. */
export function draftRows(drafts: Draft[], topicOf: Record<string, string>, lang: Lang) {
  return drafts.filter((d) => topicOf[d.topic] && !issues(d).length).map((d) => ({
    topic_id: topicOf[d.topic], difficulty: 2, [`text_${lang}`]: d.text.trim(),
    [`explanation_${lang}`]: d.explanation?.trim() ?? "",
    options: d.options.map((o, i) => ({ [`text_${lang}`]: o.trim(), is_correct: i === d.correct })).filter((o) => o[`text_${lang}`]),
  }));
}

// ---------- Язык и тема программы ----------

/** Язык текста по буквам: казахские буквы → kk, кириллица → ru, латиница → en. */
export function detectLang(texts: string[]): Lang {
  const s = texts.join(" ");
  const count = (re: RegExp) => s.match(re)?.length ?? 0;
  const cyr = count(/[а-яёәғқңөұүһі]/gi);
  if (count(/[әғқңөұүһі]/gi) > cyr * 0.01 && cyr) return "kk";
  return cyr >= count(/[a-z]/gi) ? "ru" : "en";
}

// Слова для сравнения названий: без регистра, цифр и знаков; первые 5 букв — чтобы «бөлшектер» и «бөлшектерді» совпали.
const stems = (s: string) => new Set(s.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\s]/gu, " ").split(/\s+/)
  .filter((w) => w.length > 2).map((w) => w.slice(0, 5)));

function similarity(a: string, b: string): number {
  const x = stems(a);
  const y = stems(b);
  if (!x.size || !y.size) return 0;
  let common = 0;
  for (const w of x) if (y.has(w)) common++;
  return (2 * common) / (x.size + y.size);
}

/** Тема программы, похожая на название из файла (или null). */
export function suggestTopic(title: string, topics: TopicRow[]): string | null {
  let best: { id: string; score: number } | null = null;
  for (const t of topics) {
    const score = Math.max(...[t.title_kk, t.title_ru, t.title_en].map((x) => similarity(title, x)));
    if (score > (best?.score ?? 0)) best = { id: t.id, score };
  }
  return best && best.score >= 0.34 ? best.id : null;
}

// ---------- Ключ ответов ----------

// Буквы ответа латиницей и кириллицей: A/А, B/В/Б, C/С, D/Д, E/Е.
const LETTERS: Record<string, number> = { A: 0, А: 0, B: 1, В: 1, Б: 1, C: 2, С: 2, D: 3, Д: 3, E: 4, Е: 4 };
export const letterIndex = (s: string): number | null => LETTERS[s.toUpperCase()] ?? null;

/** Номер темы: «38 – 39» → "38-39". */
export const topicKey = (s: string) => s.replace(/\s+/g, "").replace(/[–—]/g, "-");

/** «$1 1A. 2D. $38-39 1C 2D» → тема → номер вопроса → буква. */
export function parseKey(text: string): Map<string, Map<number, string>> {
  const out = new Map<string, Map<number, string>>();
  for (const part of text.split("$").slice(1)) {
    const m = /^\s*(\d+(?:\s*[-–—,]\s*\d+)*)\s*[.:)]?([\s\S]*)$/.exec(part);
    if (!m) continue;
    const answers = out.get(topicKey(m[1])) ?? new Map<number, string>();
    for (const a of m[2].matchAll(/(\d{1,3})\s*[-–—.):]?\s*([A-Za-zА-Яа-я])(?![A-Za-zА-Яа-я])/g)) {
      if (letterIndex(a[2]) !== null) answers.set(Number(a[1]), a[2].toUpperCase());
    }
    out.set(topicKey(m[1]), answers);
  }
  return out;
}

// ---------- Excel со своими столбцами ----------

/** Какой столбец что значит (номера столбцов с 0). */
export interface ColumnMap {
  topic: number | null;
  text: number;
  correct: number;
  options: number[]; // варианты ответа; правильный может быть среди них (тогда в «correct» — буква или тот же текст)
  explanation: number | null;
}

const has = (h: string, words: string[]) => words.some((w) => h.includes(w));

/** Догадка по названиям столбцов: «Вопрос», «A», «B», «Ответ»… */
export function guessColumns(head: string[]): ColumnMap {
  const h = head.map((x) => String(x ?? "").trim().toLowerCase());
  const find = (words: string[], skip: number[] = []) => h.findIndex((x, i) => !skip.includes(i) && has(x, words));
  const topic = find(["тема", "тақырып", "topic"]);
  const text = find(["вопрос", "сұрақ", "question"], [topic]);
  const correct = find(["правильн", "дұрыс", "correct", "ответ", "жауап", "answer", "кілт", "ключ", "key"], [topic, text]);
  const explanation = find(["пояснен", "түсін", "explanation"], [topic, text, correct]);
  const taken = [topic, text, correct, explanation];
  const options = h.map((_, i) => i).filter((i) => !taken.includes(i) && h[i] !== "" &&
    (/^[a-eа-е]\)?$/.test(h[i]) || has(h[i], ["вариант", "нұсқа", "option", "неверн", "қате", "wrong"])));
  return { topic: topic < 0 ? null : topic, text, correct, options, explanation: explanation < 0 ? null : explanation };
}

/** Строки листа → вопросы. Правильный ответ: буква (A–E) среди вариантов, тот же текст или отдельный текст. */
export function sheetToDrafts(aoa: unknown[][], map: ColumnMap): DraftSet {
  const cell = (r: unknown[], i: number | null) => (i === null || i < 0 ? "" : String(r[i] ?? "").trim());
  const topics = new Map<string, FileTopic>();
  const drafts: Draft[] = [];
  aoa.slice(1).forEach((r, k) => {
    if (!r || r.every((v) => String(v ?? "").trim() === "")) return;
    const title = cell(r, map.topic);
    if (!topics.has(title)) topics.set(title, { key: title, label: title, title });
    const options = map.options.map((i) => cell(r, i)).filter(Boolean);
    const right = cell(r, map.correct);
    let correct: number | null = null;
    const byLetter = right.length === 1 ? letterIndex(right) : null;
    if (byLetter !== null && byLetter < options.length) correct = byLetter;
    else if (right && options.includes(right)) correct = options.indexOf(right);
    else if (right) { options.unshift(right); correct = 0; }
    drafts.push({ id: `x${k + 2}`, topic: title, num: k + 2, text: cell(r, map.text), options, correct,
      explanation: cell(r, map.explanation) });
  });
  return { topics: [...topics.values()], drafts, noKey: false };
}
