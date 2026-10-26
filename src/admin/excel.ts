// Excel в админке: шаблон, чтение файла с проверкой строк, выгрузка вопросов.
// Одна строка таблицы — один вопрос. Правильный ответ — всегда в своём столбце, сайт сам перемешивает варианты.
// Разбор строк — без библиотеки (легко тестировать); сама библиотека xlsx загружается только при работе с файлом.
import { LANGS, type Lang } from "../lib/types";
import { requiredLangs, type L3, type QuestionRow } from "./form";

const UP = (l: Lang) => l.toUpperCase();
const GROUPS = [
  { key: "text", title: "Вопрос" },
  { key: "o0", title: "Правильный ответ" },
  { key: "o1", title: "Неверный 1" },
  { key: "o2", title: "Неверный 2" },
  { key: "o3", title: "Неверный 3" },
  { key: "explanation", title: "Пояснение" },
] as const;
type GroupKey = (typeof GROUPS)[number]["key"];

/** Заголовки столбцов: Тема, затем по три языка на каждую группу, Сложность. */
export const HEADERS = [
  "Тема",
  ...GROUPS.flatMap((g) => LANGS.map((l) => `${g.title} ${UP(l)}`)),
  "Сложность (1–3)",
];
export const EXPORT_HEADERS = [...HEADERS, "Статус"];

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/ё/g, "е").replace(/[\s()–-]+/g, "");
const cell = (v: unknown) => (v == null ? "" : String(v).trim());

export interface ParsedRow {
  line: number; // номер строки в Excel (как видит человек)
  topic: string;
  text: L3;
  explanation: L3;
  options: { text: L3; correct: boolean }[];
  difficulty: number;
  errors: string[]; // строка не будет загружена
  warnings: string[]; // загрузится, но в черновик с пометкой
}

export interface Parsed {
  rows: ParsedRow[];
  problems: string[]; // ошибки всего файла (например, нет нужных столбцов)
}

/** Разбирает лист (массив строк) в вопросы. onlyLang — язык языкового предмета или null. */
export function parseSheet(aoa: unknown[][], onlyLang: Lang | null): Parsed {
  const head = (aoa[0] ?? []).map(norm);
  const col = (name: string) => head.indexOf(norm(name));
  const missing = HEADERS.filter((h) => col(h) < 0);
  if (col("Тема") < 0 || missing.length > HEADERS.length / 2) {
    return { rows: [], problems: ["Не найдены столбцы шаблона. Скачайте шаблон и вставьте вопросы в него."] };
  }
  const iDiff = head.findIndex((h) => h.startsWith("сложность"));
  const need = requiredLangs(onlyLang);

  const rows: ParsedRow[] = [];
  aoa.slice(1).forEach((r, k) => {
    if (!r || r.every((v) => cell(v) === "")) return;
    const get = (name: string) => { const i = col(name); return i < 0 ? "" : cell(r[i]); };
    const g3 = (key: GroupKey): L3 => {
      const title = GROUPS.find((g) => g.key === key)!.title;
      return { kk: get(`${title} KK`), ru: get(`${title} RU`), en: get(`${title} EN`) };
    };
    const filled = (t: L3) => LANGS.some((l) => t[l]);

    const text = g3("text");
    const all = (["o0", "o1", "o2", "o3"] as const).map((key, i) => ({ text: g3(key), correct: i === 0 }));
    const options = all.filter((o, i) => i === 0 || filled(o.text));
    const rawDiff = iDiff < 0 ? "" : cell(r[iDiff]);
    const difficulty = rawDiff === "" ? 2 : Number(rawDiff);

    const errors: string[] = [];
    const warnings: string[] = [];
    const topic = get("Тема");
    if (!topic) errors.push("не указана тема");
    if (!filled(text)) errors.push("нет текста вопроса");
    if (!filled(all[0].text)) errors.push("нет правильного ответа");
    if (options.length < 3) errors.push("нужно минимум 2 неверных ответа");
    if (![1, 2, 3].includes(difficulty)) errors.push("сложность должна быть 1, 2 или 3");
    if (!errors.length) {
      const gaps = need.filter((l) => !text[l] || options.some((o) => !o.text[l]));
      if (gaps.length) warnings.push(`не хватает текста на ${gaps.map(UP).join(", ")}`);
    }
    rows.push({ line: k + 2, topic, text, explanation: g3("explanation"), options, difficulty, errors, warnings });
  });
  if (!rows.length) return { rows, problems: ["В файле нет вопросов."] };
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

const STATUS = { draft: "черновик", review: "на проверке", published: "опубликован" };

/** Вопросы → лист Excel в формате шаблона (плюс столбец «Статус»). Правильный ответ ставится первым. */
export function exportSheet(items: { topic: string; q: QuestionRow }[]): string[][] {
  const t = (row: object, prefix: string, l: Lang) => (row as Record<string, string | null>)[`${prefix}_${l}`] ?? "";
  return [EXPORT_HEADERS, ...items.map(({ topic, q }) => {
    const opts = q.options.slice().sort((a, b) => Number(b.is_correct) - Number(a.is_correct) || a.sort_order - b.sort_order);
    const cells = [topic, ...LANGS.map((l) => t(q, "text", l))];
    for (let i = 0; i < 4; i++) cells.push(...LANGS.map((l) => (opts[i] ? t(opts[i], "text", l) : "")));
    cells.push(...LANGS.map((l) => t(q, "explanation", l)), String(q.difficulty), STATUS[q.status]);
    return cells;
  })];
}

/** Шаблон: пример строки и лист с объяснением. */
export function templateSheets(): Record<string, string[][]> {
  const example = ["Обыкновенные дроби",
    "3/4 + 1/4 нешеге тең?", "Чему равно 3/4 + 1/4?", "What is 3/4 + 1/4?",
    "1", "1", "1", "1/2", "1/2", "1/2", "4/8", "4/8", "4/8", "", "", "",
    "Бөлімдері бірдей: 3 + 1 = 4, 4/4 = 1", "Знаменатели равны: 3 + 1 = 4, 4/4 = 1", "Same denominators: 3 + 1 = 4, 4/4 = 1", "1"];
  const help = [
    ["Как заполнять"],
    ["Одна строка — один вопрос. Первая строка с названиями столбцов должна остаться."],
    ["Тема — название темы. Если такой темы в выбранном предмете и классе нет, она будет создана."],
    ["Правильный ответ пишется в столбцы «Правильный ответ», на сайте варианты перемешиваются."],
    ["Нужно минимум 2 неверных ответа; «Неверный 3» можно оставить пустым."],
    ["Если текст одинаковый на всех языках (числа, формулы) — повторите его во всех трёх столбцах."],
    ["Формулы: \\( x^2 \\) внутри текста, \\[ \\frac{a}{b} \\] отдельно."],
    ["Пояснение — необязательно. Сложность: 1 — лёгкий, 2 — средний, 3 — сложный (пусто = 2)."],
    ["Все загруженные вопросы попадают в черновики. Опубликовать их можно в админке."],
  ];
  return { "Вопросы": [HEADERS, example], "Как заполнять": help };
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
