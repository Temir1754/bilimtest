// Таблицы переноса старых вопросов docs/gradeN-mapping.md → список переносов «вопрос → новая тема».
// Строка таблицы: | № или №–№ | Старая тема | Вопрос | [**N кл.** →] Раздел → Тема | ✅/❓/⛔ комментарий |
// Номера идут подряд внутри старой темы; первый номер темы — её первый вопрос (DECISIONS.md №53–54).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Curriculum } from "./curriculum";
import type { RawSubject, RawText } from "../src/lib/legacy";
import { questionKey } from "../src/lib/legacy";
import type { Db } from "./importer";

export type Mark = "ok" | "approx" | "none";

export interface Move {
  file: string;        // gradeN-mapping.md
  row: string;         // номер строки таблицы, как в файле: «6–9»
  mark: Mark;
  note: string;        // комментарий после значка
  questionKey: string; // legacy_key вопроса: subject|grade|ti|qi
  subject: string;     // предмет новой темы (slug)
  grade: number;       // класс новой темы
  section: string;
  topic: string;
  topicTitles: string[]; // kk, ru, en из программы — по ним тема ищется в базе
}

export interface MappingResult {
  moves: Move[];
  errors: string[];
  kept: number;
  /** Неточные совпадения названий (сокращения в таблице) — для проверки глазами. */
  fuzzy: string[];
}

const MARKS: Record<string, Mark> = { "✅": "ok", "❓": "approx", "⛔": "none" };
const norm = (s: string) => s.replace(/ё/g, "е").replace(/\s+/g, " ").trim().toLowerCase();
const titles = (t: RawText | string[]) => (typeof t === "string" ? [t] : t).map(norm);

/** Насколько название из таблицы похоже на настоящее: 3 — совпадает, 2 — начало, 1 — входит, 0 — нет.
 *  В таблицах встречаются сокращения: «ФСУ», «Служебные слова…», «Кислородсодержащие соединения». */
function likeness(short: string, full: RawText | string[]): number {
  const a = norm(short).replace(/…$/, "");
  return Math.max(...titles(full).map((b) => (a === b ? 3 : b.startsWith(a) ? 2 : b.includes(a) || a.includes(b) ? 1 : 0)));
}

/** Лучший кандидат, если он один; иначе undefined. */
function best<T>(items: T[], score: (x: T) => number): T | undefined {
  const scored = items.map((x) => ({ x, s: score(x) })).filter((c) => c.s > 0);
  const top = Math.max(0, ...scored.map((c) => c.s));
  const hits = scored.filter((c) => c.s === top);
  return hits.length === 1 ? hits[0].x : undefined;
}

/** Ищет тему в программе класса по названию темы в нужном предмете; раздел — подсказка при похожих темах. */
function findTopic(c: Curriculum, subject: string, section: string, topic: string) {
  const all = c.subjects.filter((s) => s.id === subject).flatMap((s) =>
    s.sections.flatMap((sec) => sec.topics.map((t) => ({ subject: s.id, sec, t }))));
  const hit = best(all, (h) => likeness(topic, h.t) * 4 + likeness(section, h.sec.title));
  if (!hit || likeness(topic, hit.t) === 0) return undefined;
  const exact = likeness(topic, hit.t) === 3 && likeness(section, hit.sec.title) === 3;
  return { subject: hit.subject, section: hit.sec.title[1], topic: hit.t[1], topicTitles: hit.t, exact };
}

export function parseMapping(file: string, md: string, grade: number, data: Map<string, RawSubject>,
  curricula: Map<number, Curriculum>): MappingResult {
  const moves: Move[] = [];
  const errors: string[] = [];
  const fuzzy: string[] = [];
  let subject = ""; // предмет старых вопросов
  let target = "";  // предмет новых тем: обычно тот же; «(kazlit → litread)» — другой (№52)
  // Номера по старым темам: «предмет|тема» → первый номер и список номеров по порядку.
  const groups = new Map<string, { ti: number; first: number; nums: number[] }>();

  for (const [i, line] of md.split(/\r?\n/).entries()) {
    const where = `${file}:${i + 1}`;
    const h = line.match(/^## .*\((\w+)(?: → (\w+))?\)/);
    if (h) { subject = h[1]; target = h[2] ?? h[1]; continue; }
    if (line.startsWith("## ")) { subject = ""; continue; }
    if (!/^\| \d/.test(line)) continue;
    const cells = line.replace(/\\\|/g, "\u0000").split("|").slice(1, -1).map((c) => c.replace(/\u0000/g, "|").trim());
    if (cells.length !== 5) { errors.push(`${where}: в строке не 5 колонок`); continue; }
    const [num, oldTitle, , dest, markCell] = cells;
    const nm = num.match(/^(\d+)(?:–(\d+))?$/);
    const mark = MARKS[markCell.slice(0, 1)];
    if (!nm || !mark) { errors.push(`${where}: не понял номер или значок`); continue; }
    if (!subject) { errors.push(`${where}: строка вне раздела предмета`); continue; }

    const raw = data.get(subject);
    const topicsOld = raw?.grades[String(grade)] ?? [];
    const old = best(topicsOld.map(([t], ti) => ({ t, ti })), (x) => likeness(oldTitle, x.t));
    if (!old) { errors.push(`${where}: старая тема «${oldTitle}» не найдена в data/${subject}.json`); continue; }
    const ti = old.ti;
    if (likeness(oldTitle, old.t) < 3) fuzzy.push(`${where}: старая тема «${oldTitle}» = «${titles(old.t)[1]}»`);

    const tm = dest.match(/^(?:\*\*(\d+) кл\.\*\* → )?(.+?) → (.+)$/);
    if (!tm) { errors.push(`${where}: не понял «Куда»: ${dest}`); continue; }
    const toGrade = tm[1] ? +tm[1] : grade;
    const cur = curricula.get(toGrade);
    const found = cur && findTopic(cur, target, tm[2], tm[3]);
    if (!found) { errors.push(`${where}: нет темы «${tm[2]} → ${tm[3]}» в программе ${toGrade} класса`); continue; }
    if (!found.exact) fuzzy.push(`${where}: «${tm[2]} → ${tm[3]}» = «${found.section} → ${found.topic}»`);

    const from = +nm[1], to = nm[2] ? +nm[2] : from;
    const g = groups.get(`${subject}|${ti}`) ?? { ti, first: from, nums: [] };
    groups.set(`${subject}|${ti}`, g);
    for (let n = from; n <= to; n++) {
      const qi = n - g.first;
      g.nums.push(n);
      moves.push({ file, row: num, mark, note: markCell.slice(1).trim(), questionKey: questionKey(subject, grade, ti, qi),
        subject: found.subject, grade: toGrade, section: found.section, topic: found.topic, topicTitles: found.topicTitles });
    }
  }

  // Каждая старая тема перечислена целиком и по порядку: номера подряд, столько же, сколько вопросов.
  for (const [k, g] of groups) {
    const [subj] = k.split("|");
    const count = data.get(subj)!.grades[String(grade)][g.ti][1].length;
    const ok = g.nums.every((n, i) => n === g.first + i) && g.nums.length === count;
    if (!ok) errors.push(`${file}: тема ${subj} №${g.ti + 1}: номера ${g.nums.join(",")} — ожидалось ${count} подряд`);
  }
  const listed = new Set([...groups.keys()]);
  const kept = [...data.values()].reduce((n, s) => n + (s.grades[String(grade)] ?? [])
    .filter((_, ti) => !listed.has(`${s.id}|${ti}`)).reduce((m, [, qs]) => m + qs.length, 0), 0);
  return { moves, errors, kept, fuzzy };
}

/** Все таблицы 4–11 классов из docs/. */
export function readMappings(root: string): MappingResult {
  const data = new Map<string, RawSubject>();
  for (const id of ["math", "algebra", "geometry", "worldknow", "science", "physics", "chemistry", "biology", "geography",
    "histkz", "worldhist", "informatics", "kazakh", "kazlit", "russian", "english"]) {
    data.set(id, JSON.parse(readFileSync(join(root, "data", `${id}.json`), "utf8")));
  }
  const curricula = new Map<number, Curriculum>();
  for (let g = 4; g <= 11; g++) {
    curricula.set(g, JSON.parse(readFileSync(join(root, "data", "curriculum", `grade${g}.json`), "utf8")));
  }
  const all: MappingResult = { moves: [], errors: [], kept: 0, fuzzy: [] };
  for (let g = 4; g <= 11; g++) {
    const file = `grade${g}-mapping.md`;
    const r = parseMapping(file, readFileSync(join(root, "docs", file), "utf8"), g, data, curricula);
    all.moves.push(...r.moves);
    all.errors.push(...r.errors);
    all.kept += r.kept;
    all.fuzzy.push(...r.fuzzy);
  }
  return all;
}

/** Находит в базе новые темы и старые вопросы для переносов. Ошибки — если тема не найдена или найдено несколько. */
export async function planMoves(db: Db, moves: Move[]): Promise<{ rows: { key: string; topic_id: string }[]; errors: string[] }> {
  const topics = await db.query<{ id: string; slug: string; grade: number; title_kk: string; title_ru: string; title_en: string }>(`
    select t.id, s.slug, t.grade, t.title_kk, t.title_ru, t.title_en from public.topics t
    join public.subjects s on s.id = t.subject_id where t.section_id is not null`);
  const keys = new Set((await db.query<{ legacy_key: string }>(
    "select legacy_key from public.questions where legacy_key = any($1::text[])", [moves.map((m) => m.questionKey)]))
    .map((r) => r.legacy_key));
  const rows: { key: string; topic_id: string }[] = [];
  const errors: string[] = [];
  for (const m of moves) {
    const want = m.topicTitles.map(norm);
    const hits = topics.filter((t) => t.slug === m.subject && t.grade === m.grade &&
      [t.title_kk, t.title_ru, t.title_en].some((x) => x && want.includes(norm(x))));
    if (!keys.has(m.questionKey)) errors.push(`${m.file} строка ${m.row}: вопроса ${m.questionKey} нет в базе`);
    else if (hits.length !== 1) errors.push(`${m.file} строка ${m.row}: тема «${m.topic}» (${m.subject}, ${m.grade} кл.) — в базе найдено ${hits.length}`);
    else rows.push({ key: m.questionKey, topic_id: hits[0].id });
  }
  return { rows, errors };
}

/** Переносит вопросы в новые темы. Вызывать внутри транзакции. Возвращает число перенесённых. */
export async function applyMoves(db: Db, rows: { key: string; topic_id: string }[]): Promise<number> {
  const done = await db.query(`
    update public.questions q set topic_id = m.topic_id
      from json_to_recordset($1::json) as m(key text, topic_id uuid)
     where q.legacy_key = m.key and q.topic_id is distinct from m.topic_id returning q.id`, [JSON.stringify(rows)]);
  return done.length;
}
