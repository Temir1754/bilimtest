// Excel в админке: шаблон, чтение файла с проверкой строк, выгрузка вопросов.
// Одна строка таблицы — один вопрос. Правильный ответ — всегда в своём столбце, сайт сам перемешивает варианты.
// Шаблон создаётся на языке админки, а при чтении столбцы узнаются по названиям на любом из трёх языков.
// Разбор строк — без библиотеки (легко тестировать); сама библиотека xlsx загружается только при работе с файлом.
import { ADMIN, type AdminText } from "../i18n/admin";
import { LANGS, type Lang } from "../lib/types";
import { requiredLangs, type L3, type QuestionRow } from "./form";

const UP = (l: Lang) => l.toUpperCase();
const GROUPS = ["text", "o0", "o1", "o2", "o3", "explanation"] as const;
type Group = (typeof GROUPS)[number];

/** Заголовки столбцов: Тема, по три языка на каждую группу, Сложность. */
export function headers(t: AdminText): string[] {
  return [t.xl.topic, ...GROUPS.flatMap((g) => LANGS.map((l) => `${t.xl.groups[g]} ${UP(l)}`)), t.xl.difficulty];
}
export const exportHeaders = (t: AdminText) => [...headers(t), t.xl.status];

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/ё/g, "е").replace(/[\s()–-]+/g, "");
const cell = (v: unknown) => (v == null ? "" : String(v).trim());

// Названия столбцов на всех языках: «вопросru» / «сұрақru» / «questionru» → text_ru и т. д.
const ALIASES = new Map<string, string>();
for (const t of Object.values(ADMIN)) {
  ALIASES.set(norm(t.xl.topic), "topic");
  for (const g of GROUPS) for (const l of LANGS) ALIASES.set(norm(`${t.xl.groups[g]} ${UP(l)}`), `${g}_${l}`);
}
const isDifficulty = (h: string) => Object.values(ADMIN).some((t) => h.startsWith(norm(t.xl.difficulty).replace(/13$/, "")));

export interface ParsedRow {
  line: number; // номер строки в Excel (как видит человек)
  topic: string;
  text: L3;
  explanation: L3;
  options: { text: L3; correct: boolean }[];
  difficulty: number;
  errors: string[]; // строка не будет загружена
  warnings: string[]; // загрузится в черновик с пометкой
}

export interface Parsed {
  rows: ParsedRow[];
  problems: string[]; // ошибки всего файла (например, нет нужных столбцов)
}

/** Разбирает лист (массив строк) в вопросы. onlyLang — язык языкового предмета или null. */
export function parseSheet(aoa: unknown[][], onlyLang: Lang | null, t: AdminText): Parsed {
  const head = (aoa[0] ?? []).map(norm);
  const col = new Map<string, number>();
  head.forEach((h, i) => { const k = ALIASES.get(h); if (k && !col.has(k)) col.set(k, i); });
  const iDiff = head.findIndex(isDifficulty);
  if (!col.has("topic") || col.size < 10) return { rows: [], problems: [t.xl.notTemplate] };
  const need = requiredLangs(onlyLang);
  const e = t.xl.rowErr;

  const rows: ParsedRow[] = [];
  aoa.slice(1).forEach((r, k) => {
    if (!r || r.every((v) => cell(v) === "")) return;
    const get = (key: string) => { const i = col.get(key); return i === undefined ? "" : cell(r[i]); };
    const g3 = (g: Group): L3 => ({ kk: get(`${g}_kk`), ru: get(`${g}_ru`), en: get(`${g}_en`) });
    const filled = (x: L3) => LANGS.some((l) => x[l]);

    const text = g3("text");
    const all = (["o0", "o1", "o2", "o3"] as const).map((g, i) => ({ text: g3(g), correct: i === 0 }));
    const options = all.filter((o, i) => i === 0 || filled(o.text));
    const rawDiff = iDiff < 0 ? "" : cell(r[iDiff]);
    const difficulty = rawDiff === "" ? 2 : Number(rawDiff);

    const errors: string[] = [];
    const warnings: string[] = [];
    const topic = get("topic");
    if (!topic) errors.push(e.noTopic);
    if (!filled(text)) errors.push(e.noText);
    if (!filled(all[0].text)) errors.push(e.noCorrect);
    if (options.length < 3) errors.push(e.need2Wrong);
    if (![1, 2, 3].includes(difficulty)) errors.push(e.badDiff);
    if (!errors.length) {
      const gaps = need.filter((l) => !text[l] || options.some((o) => !o.text[l]));
      if (gaps.length) warnings.push(e.gaps(gaps.map(UP).join(", ")));
    }
    rows.push({ line: k + 2, topic, text, explanation: g3("explanation"), options, difficulty, errors, warnings });
  });
  if (!rows.length) return { rows, problems: [t.xl.emptyFile] };
  return { rows, problems: [] };
}

/** Строки без ошибок → аргумент функции базы import_questions. */
export function toImportRows(rows: ParsedRow[]) {
  return rows.filter((r) => !r.errors.length).map((r) => {
    const out: Record<string, unknown> = { topic: r.topic, difficulty: r.difficulty };
    for (const l of LANGS) {
      out[`text_${l}`] = r.text[l];
      out[`explanation_${l}`] = r.explanation[l];
    }
    out.options = r.options.map((o) => ({ text_kk: o.text.kk, text_ru: o.text.ru, text_en: o.text.en, is_correct: o.correct }));
    return out;
  });
}

/** Вопросы → лист Excel в формате шаблона (плюс столбец «Статус»). Правильный ответ ставится первым. */
export function exportSheet(items: { topic: string; q: QuestionRow }[], t: AdminText): string[][] {
  const get = (row: object, prefix: string, l: Lang) => (row as Record<string, string | null>)[`${prefix}_${l}`] ?? "";
  return [exportHeaders(t), ...items.map(({ topic, q }) => {
    const opts = q.options.slice().sort((a, b) => Number(b.is_correct) - Number(a.is_correct) || a.sort_order - b.sort_order);
    const cells = [topic, ...LANGS.map((l) => get(q, "text", l))];
    for (let i = 0; i < 4; i++) cells.push(...LANGS.map((l) => (opts[i] ? get(opts[i], "text", l) : "")));
    cells.push(...LANGS.map((l) => get(q, "explanation", l)), String(q.difficulty), t.xl.statusText[q.status]);
    return cells;
  })];
}

/** Шаблон: пример строки и лист с объяснением. */
export function templateSheets(t: AdminText): Record<string, string[][]> {
  const example = ["Обыкновенные дроби",
    "3/4 + 1/4 нешеге тең?", "Чему равно 3/4 + 1/4?", "What is 3/4 + 1/4?",
    "1", "1", "1", "1/2", "1/2", "1/2", "4/8", "4/8", "4/8", "", "", "",
    "Бөлімдері бірдей: 3 + 1 = 4, 4/4 = 1", "Знаменатели равны: 3 + 1 = 4, 4/4 = 1", "Same denominators: 3 + 1 = 4, 4/4 = 1", "1"];
  return { [t.xl.sheet]: [headers(t), example], [t.xl.helpSheet]: t.xl.help.map((s) => [s]) };
}

// ---------- Работа с файлами (библиотека xlsx загружается только здесь) ----------

/** Читает первый лист файла .xlsx / .xls / .csv в массив строк. */
export async function readFile(file: File): Promise<unknown[][]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer());
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: true });
}

/** Скачивает книгу Excel с листами sheets. */
export async function download(name: string, sheets: Record<string, string[][]>) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const [title, aoa] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = aoa[0].map((_, i) => ({ wch: i === 0 ? 28 : 22 }));
    XLSX.utils.book_append_sheet(wb, ws, title);
  }
  XLSX.writeFile(wb, name);
}
