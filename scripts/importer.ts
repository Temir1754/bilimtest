// Импорт data/*.json в базу. Работает с любым подключением, у которого есть query(sql, params):
// с облачной базой (scripts/import-json.ts) и с локальной PGlite в тестах.
//
// Повторный запуск не создаёт дублей: предметы узнаются по slug, темы и вопросы — по legacy_key,
// варианты — по (вопрос, номер). По умолчанию уже загруженное не трогается, чтобы не затереть
// правки из админки; с force: true содержимое из JSON перезаписывает базу.
import { convertSubject, sortIndex, type RawSubject } from "../src/lib/legacy";
import type { Text } from "../src/lib/types";

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface ImportReport {
  inserted: { subjects: number; topics: number; questions: number; options: number };
  updated: { subjects: number; topics: number; questions: number; options: number };
  expected: { subjects: number; topics: number; questions: number };
  found: { subjects: number; topics: number; questions: number };
}

const t3 = (t: Text) => ({ kk: t.kk ?? null, ru: t.ru ?? null, en: t.en ?? null });

function upsert(conflict: string, force: boolean, columns: string[]) {
  return force
    ? `on conflict (${conflict}) do update set ${columns.map((c) => `${c} = excluded.${c}`).join(", ")}`
    : `on conflict (${conflict}) do nothing`;
}

async function count(db: Db, sql: string, rows: unknown[]) {
  const r = await db.query<{ inserted: boolean }>(sql, [JSON.stringify(rows)]);
  return { inserted: r.filter((x) => x.inserted).length, updated: r.filter((x) => !x.inserted).length };
}

/** Вызывать внутри транзакции: проверка «опубликованный вопрос полный» срабатывает при её завершении. */
export async function importSubjects(db: Db, raws: RawSubject[], { force = false } = {}): Promise<ImportReport> {
  const sorted = raws.slice().sort((a, b) => sortIndex(a.id) - sortIndex(b.id) || a.id.localeCompare(b.id));
  type Row<K extends string> = Record<K, string> & Record<string, unknown>;
  const subjects: Row<"slug">[] = [], topics: Row<"legacy_key">[] = [], questions: Row<"legacy_key">[] = [];
  const options: (Row<"question_key"> & { n: number })[] = [];
  for (const [i, raw] of sorted.entries()) {
    const c = convertSubject(raw, i);
    const n = t3(c.subject.name);
    subjects.push({ slug: c.subject.id, icon: c.subject.icon, name_kk: n.kk, name_ru: n.ru, name_en: n.en,
      only_lang: c.subject.onlyLang, sort_order: i });
    for (const tp of c.topics) {
      const t = t3(tp.title);
      topics.push({ legacy_key: tp.id, subject_slug: tp.subjectId, grade: tp.grade,
        title_kk: t.kk ?? "", title_ru: t.ru ?? "", title_en: t.en ?? "", sort_order: tp.sort });
    }
    for (const q of c.questions) {
      const t = t3(q.text);
      questions.push({ legacy_key: q.id, topic_key: q.topicId, text_kk: t.kk, text_ru: t.ru, text_en: t.en,
        sort_order: Number(q.id.split("|")[3]) });
      q.options.forEach((o, j) => {
        const ot = t3(o.text);
        options.push({ question_key: q.id, sort_order: j, is_correct: o.correct,
          text_kk: ot.kk, text_ru: ot.ru, text_en: ot.en, n: q.options.length });
      });
    }
  }

  const s = await count(db, `
    insert into public.subjects (slug, icon, name_kk, name_ru, name_en, only_lang, sort_order)
    select slug, icon, name_kk, name_ru, name_en, only_lang::public.lang_code, sort_order
    from jsonb_to_recordset($1::jsonb) as x(slug text, icon text, name_kk text, name_ru text, name_en text,
      only_lang text, sort_order int)
    ${upsert("slug", force, ["icon", "name_kk", "name_ru", "name_en", "only_lang", "sort_order"])}
    returning (xmax = 0) as inserted`, subjects);

  const t = await count(db, `
    insert into public.topics (subject_id, grade, title_kk, title_ru, title_en, sort_order, legacy_key)
    select s.id, x.grade, x.title_kk, x.title_ru, x.title_en, x.sort_order, x.legacy_key
    from jsonb_to_recordset($1::jsonb) as x(legacy_key text, subject_slug text, grade int,
      title_kk text, title_ru text, title_en text, sort_order int)
    join public.subjects s on s.slug = x.subject_slug
    ${upsert("legacy_key", force, ["subject_id", "grade", "title_kk", "title_ru", "title_en", "sort_order"])}
    returning (xmax = 0) as inserted`, topics);

  const q = await count(db, `
    insert into public.questions (topic_id, text_kk, text_ru, text_en, status, sort_order, legacy_key, author_id)
    select t.id, x.text_kk, x.text_ru, x.text_en, 'published', x.sort_order, x.legacy_key, null
    from jsonb_to_recordset($1::jsonb) as x(legacy_key text, topic_key text, text_kk text, text_ru text,
      text_en text, sort_order int)
    join public.topics t on t.legacy_key = x.topic_key
    ${upsert("legacy_key", force, ["topic_id", "text_kk", "text_ru", "text_en", "status", "sort_order"])}
    returning (xmax = 0) as inserted`, questions);

  const o = await count(db, `
    insert into public.options (question_id, sort_order, is_correct, text_kk, text_ru, text_en)
    select q.id, x.sort_order, x.is_correct, x.text_kk, x.text_ru, x.text_en
    from jsonb_to_recordset($1::jsonb) as x(question_key text, sort_order int, is_correct boolean,
      text_kk text, text_ru text, text_en text)
    join public.questions q on q.legacy_key = x.question_key
    ${upsert("question_id, sort_order", force, ["is_correct", "text_kk", "text_ru", "text_en"])}
    returning (xmax = 0) as inserted`, options);

  if (force) {
    // Если в JSON вариантов стало меньше — лишние удаляем.
    const counts = [...new Map(options.map((x) => [x.question_key, x.n])).entries()].map(([k, n]) => ({ k, n }));
    await db.query(`
      delete from public.options o using public.questions q, jsonb_to_recordset($1::jsonb) as x(k text, n int)
      where o.question_id = q.id and q.legacy_key = x.k and o.sort_order >= x.n`, [JSON.stringify(counts)]);
  }

  const [found] = await db.query<{ subjects: number; topics: number; questions: number }>(`
    select
      (select count(*)::int from public.subjects where slug in (select jsonb_array_elements_text($1::jsonb))) as subjects,
      (select count(*)::int from public.topics where legacy_key in (select jsonb_array_elements_text($2::jsonb))) as topics,
      (select count(*)::int from public.questions
        where status = 'published' and legacy_key in (select jsonb_array_elements_text($3::jsonb))) as questions`,
    [JSON.stringify(subjects.map((x) => x.slug)), JSON.stringify(topics.map((x) => x.legacy_key)),
      JSON.stringify(questions.map((x) => x.legacy_key))]);

  return {
    inserted: { subjects: s.inserted, topics: t.inserted, questions: q.inserted, options: o.inserted },
    updated: { subjects: s.updated, topics: t.updated, questions: q.updated, options: o.updated },
    expected: { subjects: subjects.length, topics: topics.length, questions: questions.length },
    found,
  };
}
