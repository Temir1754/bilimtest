// Источник данных сайта ученика из базы (этап 4, DECISIONS.md №97).
// Без библиотеки supabase-js: два запроса к функциям базы через fetch — главный файл сайта остаётся лёгким
// для слабых телефонов. Каталог хранится в браузере: следующий заход открывается сразу, а если база
// недоступна — сайт работает на сохранённом каталоге.
import type { Catalog, DataSource, Lang, Question, Text } from "./types";

const CACHE_KEY = "bt-catalog";
const FRESH_MS = 60 * 60 * 1000; // час: потом каталог обновляется в фоне

type Row = Record<string, unknown>;
const text = (r: Row, f: string): Text => ({ kk: (r[`${f}_kk`] as string) ?? "", ru: (r[`${f}_ru`] as string) ?? "",
  en: (r[`${f}_en`] as string) ?? "" });
const hasText = (t: Text) => Boolean(t.kk || t.ru || t.en);

/** Ответ site_catalog() → модель сайта. */
export function toCatalog(raw: { min: number; subjects: Row[]; sections: Row[]; topics: Row[] }): Catalog {
  return {
    min: raw.min,
    subjects: raw.subjects.map((s) => ({ id: s.id as string, icon: s.icon as string, name: text(s, "name"),
      onlyLang: (s.only_lang as Lang | null) ?? null, sort: s.sort_order as number })),
    sections: raw.sections.map((s) => ({ id: s.id as string, subjectId: s.subject_id as string, grade: s.grade as number,
      title: text(s, "title"), sort: s.sort_order as number })),
    topics: raw.topics.map((t) => ({ id: t.id as string, subjectId: t.subject_id as string, grade: t.grade as number,
      sectionId: (t.section_id as string | null) ?? null, title: text(t, "title"), sort: t.sort_order as number,
      ready: { kk: t.kk as number, ru: t.ru as number, en: t.en as number },
      questionCount: Math.max(t.kk as number, t.ru as number, t.en as number) })),
  };
}

/** Ответ site_questions() → вопросы сайта. */
export function toQuestions(raw: Row[]): Question[] {
  return raw.map((q) => {
    const ex = text(q, "explanation");
    return {
      id: q.id as string, topicId: q.topic_id as string, text: text(q, "text"),
      explanation: hasText(ex) ? ex : null, imageUrl: (q.image_url as string | null) ?? null,
      options: ((q.options as Row[] | null) ?? []).map((o) => ({ id: o.id as string, text: text(o, "text"),
        correct: o.is_correct === true })),
    };
  });
}

function readCache(): { at: number; catalog: Catalog } | null {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch { return null; }
}
function writeCache(catalog: Catalog) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), catalog })); } catch { /* без хранилища — без кэша */ }
}

export function dbSource(url: string, key: string, fetchFn: typeof fetch = fetch): DataSource {
  async function rpc<T>(name: string, body: object): Promise<T> {
    const res = await fetchFn(`${url}/rest/v1/rpc/${name}`, {
      method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    return res.json() as Promise<T>;
  }
  const load = async () => {
    const c = toCatalog(await rpc("site_catalog", {}));
    writeCache(c);
    return c;
  };

  return {
    async catalog() {
      const cached = readCache();
      if (cached && Date.now() - cached.at < FRESH_MS) {
        load().catch(() => {}); // свежий каталог — к следующему заходу
        return cached.catalog;
      }
      try {
        return await load();
      } catch (e) {
        if (cached) return cached.catalog; // база недоступна — работаем на сохранённом
        throw e;
      }
    },
    async questions(topicIds, lang) {
      return toQuestions(await rpc("site_questions", { p_topic_ids: topicIds, p_lang: lang }));
    },
  };
}
