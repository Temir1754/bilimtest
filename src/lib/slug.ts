// Адреса страниц сайта для Google (DECISIONS.md №101): /{язык}/{класс}/{предмет}/{тема}/.
// Одни и те же правила — у сайта (открыть тему по адресу) и у скрипта сборки (scripts/prerender.ts).
import { LANGS, visibleTopics, type Catalog, type Lang, type Subject, type Topic } from "./types";
import { tx } from "./text";

const LAT: Record<string, string> = {
  а: "a", ә: "a", б: "b", в: "v", г: "g", ғ: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "i",
  к: "k", қ: "q", л: "l", м: "m", н: "n", ң: "n", о: "o", ө: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ұ: "u", ү: "u", ф: "f", х: "kh", һ: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", і: "i",
  ь: "", э: "e", ю: "yu", я: "ya",
};

/** «Түрік қағанатының құрылуы» → «turik-qaganatynyn-quryluy». */
export function slugify(s: string): string {
  const lat = [...s.toLowerCase()].map((ch) => LAT[ch] ?? ch).join("");
  return lat.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "") || "tema";
}

/** Код предмета в адресе: slug из базы (math, histkz); у старых JSON id и есть slug. */
export const subjectSlug = (s: Subject) => s.slug ?? s.id;

/** Адреса тем одного класса и предмета на языке: одинаковые названия получают -2, -3 по порядку тем. */
export function topicSlugs(topics: Topic[], lang: Lang): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const tp of topics.slice().sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))) {
    const base = slugify(tx(tp.title, lang));
    let slug = base;
    for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;
    used.add(slug);
    out.set(tp.id, slug);
  }
  return out;
}

export function sitePath(lang: Lang, grade?: number, subject?: string, topic?: string): string {
  return "/" + [lang, grade, subject, topic].filter((x) => x !== undefined).join("/") + "/";
}

export interface Place { lang: Lang; grade?: number; subject?: string; topic?: string }

/** Разбор адреса: /kk/6/histkz/turik-qaganaty/ → { lang, grade, subject, topic }. Не наш адрес — null. */
export function parsePath(path: string): Place | null {
  const m = /^\/(kk|ru|en)(?:\/(\d{1,2})(?:\/([a-z0-9_-]+)(?:\/([a-z0-9-]+))?)?)?\/?$/.exec(path);
  if (!m) return null;
  const grade = m[2] ? Number(m[2]) : undefined;
  return { lang: m[1] as Lang, grade, subject: m[3], topic: m[4] };
}

/** Предмет и тема по адресу (среди тем, видимых на языке адреса). */
export function resolvePlace(c: Catalog, p: Place): { subject: Subject | null; topicId: string | null } {
  const subject = p.subject ? c.subjects.find((s) => subjectSlug(s) === p.subject) ?? null : null;
  if (!subject || p.grade === undefined || !p.topic) return { subject, topicId: null };
  const slugs = topicSlugs(visibleTopics(c, p.lang).filter((tp) => tp.subjectId === subject.id && tp.grade === p.grade), p.lang);
  return { subject, topicId: [...slugs].find(([, s]) => s === p.topic)?.[0] ?? null };
}

export const isLang = (s: string): s is Lang => (LANGS as readonly string[]).includes(s);
