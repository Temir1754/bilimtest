// Проверка миграций, правил доступа (RLS) и импорта на локальном Postgres (PGlite).
// Служебные части Supabase заменены упрощённой копией (supabase-stub.sql).
// Те же правила дополнительно проверяются на настоящем тестовом проекте: npm run test:db.
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { importSubjects, type Db } from "../../scripts/importer";
import { loadCurriculum, validateCurriculum, type Curriculum } from "../../scripts/curriculum";
import { dumpDb, restoreDb, tablesInOrder } from "../../scripts/backup";
import { applyMoves, cleanupOldTopics, emptyOldTopics, isReferenced, markForTeacher, planMoves, readMappings }
  from "../../scripts/mapping";
import type { RawSubject } from "../../src/lib/legacy";

const root = join(__dirname, "..", "..");
const raws = readdirSync(join(root, "data")).filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(root, "data", f), "utf8")) as RawSubject);

let db: PGlite;
const ids = {
  admin: "00000000-0000-0000-0000-00000000000a",
  teacherA: "00000000-0000-0000-0000-0000000000a1",
  teacherB: "00000000-0000-0000-0000-0000000000b1",
  student: "00000000-0000-0000-0000-000000000005",
};

const asDb = (tx: Transaction | PGlite): Db => ({
  query: async (q, p) => (await tx.query(q, p)).rows as never,
});

/** Выполняет fn от имени пользователя (как запрос через API Supabase). null — аноним. */
async function as<T>(user: keyof typeof ids | null, fn: (q: Db["query"]) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [user ? ids[user] : ""]);
    await tx.exec(`set local role ${user ? "authenticated" : "anon"}`);
    return fn(asDb(tx).query);
  });
}

const one = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) =>
  (await db.query<T>(sql, params)).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(join(__dirname, "supabase-stub.sql"), "utf8"));
  for (const f of readdirSync(join(root, "supabase", "migrations")).sort()) {
    await db.exec(readFileSync(join(root, "supabase", "migrations", f), "utf8"));
  }
  for (const [name, id] of Object.entries(ids)) {
    await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [id, `${name}@test.local`]);
  }
  await db.exec(`
    update public.profiles set role = 'admin' where id = '${ids.admin}';
    update public.profiles set role = 'teacher' where id in ('${ids.teacherA}', '${ids.teacherB}');`);
}, 60_000);

describe("импорт data/*.json", () => {
  it("загружает 16 предметов, 267 тем, 1336 вопросов", async () => {
    const r = await db.transaction((tx) => importSubjects(asDb(tx), raws));
    expect(r.found).toEqual({ subjects: 16, topics: 267, questions: 1336 });
    expect(r.inserted.questions).toBe(1336);
    const options = raws.flatMap((s) => Object.values(s.grades).flat().flatMap(([, qs]) => qs))
      .reduce((n, q) => n + q.length - 1, 0);
    expect(r.inserted.options).toBe(options);
  }, 60_000);

  it("повторный запуск не создаёт дублей и ничего не меняет", async () => {
    const r = await db.transaction((tx) => importSubjects(asDb(tx), raws));
    expect(r.inserted).toEqual({ subjects: 0, topics: 0, questions: 0, options: 0 });
    expect(r.found).toEqual({ subjects: 16, topics: 267, questions: 1336 });
    expect((await one<{ n: number }>("select count(*)::int as n from public.questions"))!.n).toBe(1336);
  }, 60_000);

  it("--force перезаписывает, но не плодит историю, если ничего не изменилось", async () => {
    const r = await db.transaction((tx) => importSubjects(asDb(tx), raws, { force: true }));
    expect(r.updated.questions).toBe(1336);
    expect((await one<{ n: number }>("select count(*)::int as n from public.question_history"))!.n).toBe(0);
  }, 60_000);

  it("у каждого вопроса ровно один правильный ответ, и он первый", async () => {
    const bad = await one<{ n: number }>(`
      select count(*)::int as n from public.questions q
      where (select count(*) from public.options o where o.question_id = q.id and o.is_correct) <> 1
         or not exists (select 1 from public.options o where o.question_id = q.id and o.is_correct and o.sort_order = 0)`);
    expect(bad!.n).toBe(0);
  });
});

// Тема и вопрос-черновик учителя A для проверок ниже.
let topicId: string;
let draftId: string;

describe("правила доступа", () => {
  beforeAll(async () => {
    topicId = (await one<{ id: string }>("select id from public.topics where legacy_key = 'math|5|0'"))!.id;
  });

  it("учитель создаёт черновик с вариантами", async () => {
    draftId = await as("teacherA", async (q) => {
      const [row] = await q<{ id: string }>(
        `insert into public.questions (topic_id, text_kk, text_ru, text_en) values ($1, 'К', 'Черновик', 'D') returning id`,
        [topicId]);
      await q(`insert into public.options (question_id, sort_order, is_correct, text_kk, text_ru, text_en)
        values ($1, 0, true, 'a', 'a', 'a'), ($1, 1, false, 'b', 'b', 'b'), ($1, 2, false, 'c', 'c', 'c')`, [row.id]);
      return row.id;
    });
    expect(draftId).toBeTruthy();
  });

  it("аноним и ученик видят только опубликованные вопросы", async () => {
    for (const who of [null, "student"] as const) {
      const n = await as(who, (q) => q<{ n: number }>("select count(*)::int as n from public.questions"));
      expect(n[0].n).toBe(1336);
      expect(await as(who, (q) => q("select * from public.questions where id = $1", [draftId]))).toEqual([]);
      expect(await as(who, (q) => q("select * from public.options where question_id = $1", [draftId]))).toEqual([]);
    }
  });

  it("аноним не может писать в questions", async () => {
    await expect(as(null, (q) => q(`insert into public.questions (topic_id, text_ru) values ($1, 'x')`, [topicId])))
      .rejects.toThrow(/permission denied/);
    await expect(as(null, (q) => q(`update public.questions set text_ru = 'взлом'`))).rejects.toThrow(/permission denied/);
  });

  it("ученик не может создать или изменить вопрос", async () => {
    await expect(as("student", (q) => q(`insert into public.questions (topic_id, text_ru) values ($1, 'x')`, [topicId])))
      .rejects.toThrow(/row-level security/);
    const upd = await as("student", (q) => q(`update public.questions set text_ru = 'взлом' returning id`));
    expect(upd).toEqual([]);
    expect(await one("select 1 from public.questions where text_ru = 'взлом'")).toBeUndefined();
  });

  it("учитель B не видит черновик учителя A и не может его менять", async () => {
    expect(await as("teacherB", (q) => q("select * from public.questions where id = $1", [draftId]))).toEqual([]);
    expect(await as("teacherB", (q) => q("update public.questions set text_ru = 'x' where id = $1 returning id", [draftId])))
      .toEqual([]);
  });

  it("учитель отправляет свой вопрос на проверку, но не публикует", async () => {
    await as("teacherA", (q) => q("update public.questions set status = 'review' where id = $1", [draftId]));
    await expect(as("teacherA", (q) => q("update public.questions set status = 'published' where id = $1", [draftId])))
      .rejects.toThrow(/row-level security/);
  });

  it("учитель не может менять опубликованные вопросы и их варианты", async () => {
    const pub = (await one<{ id: string }>("select id from public.questions where legacy_key = 'math|5|0|0'"))!.id;
    expect(await as("teacherA", (q) => q("update public.questions set text_ru = 'x' where id = $1 returning id", [pub])))
      .toEqual([]);
    expect(await as("teacherA", (q) => q("update public.options set text_ru = 'x' where question_id = $1 returning id", [pub])))
      .toEqual([]);
  });

  it("учитель создаёт тему, но не удаляет темы и не создаёт предметы", async () => {
    const subj = (await one<{ id: string }>("select id from public.subjects where slug = 'math'"))!.id;
    const [t] = await as("teacherA", (q) => q<{ id: string }>(
      "insert into public.topics (subject_id, grade, title_ru) values ($1, 5, 'Новая тема') returning id", [subj]));
    expect(t.id).toBeTruthy();
    expect(await as("teacherA", (q) => q("delete from public.topics where id = $1 returning id", [t.id]))).toEqual([]);
    await expect(as("teacherA", (q) => q(
      "insert into public.subjects (slug, name_kk, name_ru, name_en) values ('x', 'x', 'x', 'x')")))
      .rejects.toThrow(/row-level security/);
    await as("admin", (q) => q("delete from public.topics where id = $1", [t.id]));
  });

  it("админ публикует полный вопрос; неполный опубликовать нельзя", async () => {
    await as("admin", (q) => q("update public.questions set status = 'published' where id = $1", [draftId]));
    expect((await one<{ status: string }>("select status from public.questions where id = $1", [draftId]))!.status)
      .toBe("published");

    await expect(as("admin", async (q) => {
      const [row] = await q<{ id: string }>(
        `insert into public.questions (topic_id, text_kk, text_ru, text_en, status) values ($1, 'a', 'b', 'c', 'published') returning id`,
        [topicId]);
      await q(`insert into public.options (question_id, sort_order, is_correct, text_kk, text_ru, text_en)
        values ($1, 0, true, 'a', 'a', 'a'), ($1, 1, false, 'b', 'b', 'b')`, [row.id]);
    })).rejects.toThrow(/3–4 варианта/);

    await expect(as("admin", (q) => q(
      "update public.options set is_correct = true where question_id = $1 and sort_order = 1", [draftId])))
      .rejects.toThrow(/ровно один правильный/);
  });

  it("история правок сохраняет прежнюю версию", async () => {
    await as("admin", (q) => q("update public.questions set text_ru = 'Исправлено' where id = $1", [draftId]));
    const h = await one<{ snapshot: { text_ru: string; options: unknown[] }; editor_id: string }>(
      "select snapshot, editor_id from public.question_history where question_id = $1 order by created_at desc limit 1",
      [draftId]);
    expect(h!.snapshot.text_ru).toBe("Черновик");
    expect(h!.snapshot.options).toHaveLength(3);
    expect(h!.editor_id).toBe(ids.admin);
  });

  it("роль нельзя поменять самому себе; меняет только админ", async () => {
    await expect(as("student", (q) => q(`update public.profiles set role = 'admin' where id = $1`, [ids.student])))
      .rejects.toThrow(/permission denied/);
    await expect(as("teacherA", (q) => q("select public.set_user_role($1, 'admin')", [ids.teacherA])))
      .rejects.toThrow(/только админ/);
    await expect(as("admin", (q) => q("select public.set_user_role($1, 'teacher')", [ids.admin])))
      .rejects.toThrow(/последнего админа/);
    await as("student", (q) => q("update public.profiles set full_name = 'Айгерим' where id = $1", [ids.student]));
    expect(await as("student", (q) => q("select * from public.profiles where id <> $1", [ids.student]))).toEqual([]);
  });
});

describe("сохранение вопроса из админки (save_question)", () => {
  const opts = (correct: number, n = 4) => JSON.stringify(Array.from({ length: n }, (_, i) => ({
    text_kk: `в${i}`, text_ru: `в${i}`, text_en: `o${i}`, is_correct: i === correct })));
  const full = (status: string, extra = {}) => JSON.stringify({
    topic_id: topicId, text_kk: "С", text_ru: "В", text_en: "Q", status, ...extra });
  const save = (who: keyof typeof ids, id: string | null, q: string, o: string) =>
    as(who, (x) => x<{ id: string }>("select public.save_question($1, $2::jsonb, $3::jsonb) as id", [id, q, o]))
      .then((r) => r[0].id);
  const optionsOf = (id: string) => db.query<{ id: string; is_correct: boolean; text_ru: string }>(
    "select id, is_correct, text_ru from public.options where question_id = $1 order by sort_order", [id])
    .then((r) => r.rows);

  it("учитель создаёт черновик, даже незаконченный; публиковать не может", async () => {
    const id = await save("teacherA", null, JSON.stringify({ topic_id: topicId, text_ru: "Только начал" }), "[]");
    expect((await one<{ status: string }>("select status from public.questions where id = $1", [id]))!.status)
      .toBe("draft");
    await expect(save("teacherA", null, full("published"), opts(0))).rejects.toThrow(/row-level security/);
    await expect(save("teacherA", id, full("published"), opts(0))).rejects.toThrow(/row-level security/);
  });

  it("учитель не меняет чужие и опубликованные вопросы; ученик не сохраняет ничего", async () => {
    const id = await save("teacherA", null, full("draft"), opts(0));
    await expect(save("teacherB", id, full("draft"), opts(1))).rejects.toThrow(/не найден или нет прав/);
    const pub = (await one<{ id: string }>("select id from public.questions where legacy_key = 'math|5|0|2'"))!.id;
    await expect(save("teacherA", pub, full("draft"), opts(0))).rejects.toThrow(/не найден или нет прав/);
    await expect(save("student", null, full("draft"), opts(0))).rejects.toThrow(/row-level security/);
  });

  it("админ меняет правильный ответ у опубликованного вопроса; id вариантов сохраняются", async () => {
    const id = await save("admin", null, full("published"), opts(0));
    const before = await optionsOf(id);
    await save("admin", id, full("published"), opts(2));
    const after = await optionsOf(id);
    expect(after.map((o) => o.is_correct)).toEqual([false, false, true, false]);
    expect(after.map((o) => o.id)).toEqual(before.map((o) => o.id));
    const h = await one<{ snapshot: { options: { is_correct: boolean }[] } }>(
      "select snapshot from public.question_history where question_id = $1 order by created_at desc limit 1", [id]);
    expect(h!.snapshot.options.map((o) => o.is_correct)).toEqual([true, false, false, false]);
  });

  it("лишние варианты удаляются; неполный вопрос не публикуется", async () => {
    const id = await save("admin", null, full("draft"), opts(0));
    await save("admin", id, full("draft"), opts(0, 3));
    expect(await optionsOf(id)).toHaveLength(3);
    await expect(save("admin", id, full("published"), opts(0, 2))).rejects.toThrow(/3–4 варианта/);
    await expect(save("admin", id, full("draft"), opts(0, 5))).rejects.toThrow(/не больше 4/);
  });

  it("публикация (№88): достаточно одного полного языка; без полного языка — отказ", async () => {
    const kkOnly = (correct: number) => JSON.stringify(Array.from({ length: 3 }, (_, i) => ({ text_kk: `ж${i}`, is_correct: i === correct })));
    const id = await save("admin", null, full("published", { text_ru: "", text_en: "" }), kkOnly(0));
    expect(await one("select public.question_ready_in($1, 'kk') as kk, public.question_ready_in($1, 'ru') as ru", [id]))
      .toEqual({ kk: true, ru: false });
    // текст на русском есть, но варианты только на казахском, а казахского текста нет — ни один язык не полный
    await expect(save("admin", id, full("published", { text_kk: "", text_en: "" }), kkOnly(0))).rejects.toThrow(/на языке/);
  });

  it("учитель удаляет свой черновик, но не опубликованный и не чужой (№89)", async () => {
    const mine = await save("teacherA", null, full("draft"), opts(0));
    const other = await save("teacherB", null, full("draft"), opts(0));
    const pub = (await one<{ id: string }>("select id from public.questions where status = 'published' limit 1"))!.id;
    for (const id of [other, pub]) await as("teacherA", (q) => q("delete from public.questions where id = $1", [id]));
    expect(await one("select count(*)::int as n from public.questions where id in ($1, $2)", [other, pub])).toEqual({ n: 2 });
    await as("teacherA", (q) => q("delete from public.questions where id = $1", [mine]));
    expect(await one("select count(*)::int as n from public.questions where id = $1", [mine])).toEqual({ n: 0 });
    await db.query("delete from public.questions where id = $1", [other]); // не тратить дневной лимит учителя Б
  });

  it("шаги 1–2: число вопросов теме (настройка) и готовые вопросы по темам на языке", async () => {
    expect(await as("teacherA", (q) => q("select public.topic_min_questions() as n"))).toEqual([{ n: 5 }]);
    const g = (await one<{ grade: number }>("select grade from public.topics where id = $1", [topicId]))!.grade;
    const after = (lang: string) => as("teacherA", (q) => q<{ ready: number }>(
      "select ready from public.topic_counts($2::smallint, $3) where topic_id = $1", [topicId, g, lang])).then((r) => r[0].ready);
    const before = await after("ru");
    await save("admin", null, full("published", { text_ru: "", text_en: "" }),
      JSON.stringify(Array.from({ length: 3 }, (_, i) => ({ text_kk: `ж${i}`, is_correct: i === 0 }))));
    await save("teacherA", null, full("draft"), opts(0)); // черновик не считается
    expect(await after("ru")).toBe(before); // вопрос только на казахском в русском счётчике не виден
    expect(await after("kk")).toBeGreaterThan(0);
    await expect(as(null, (q) => q("select public.topic_min_questions()"))).rejects.toThrow(/permission denied/);
  });

  it("комментарий проверки пишет админ, учитель его не стирает; при публикации он очищается", async () => {
    const id = await save("teacherA", null, full("review"), opts(0));
    await save("admin", id, full("draft", { review_comment: "Исправьте вариант B" }), opts(0));
    await save("teacherA", id, full("review", { review_comment: "" }), opts(0));
    const c = () => one<{ review_comment: string | null }>("select review_comment from public.questions where id = $1", [id]);
    expect((await c())!.review_comment).toBe("Исправьте вариант B");
    await save("admin", id, full("published"), opts(0));
    expect((await c())!.review_comment).toBeNull();
  });
});

describe("загрузка из Excel (import_questions)", () => {
  const row = (topic: string, text: string, extra = {}) => ({
    topic, text_kk: text, text_ru: text, text_en: text, difficulty: 1,
    options: ["a", "b", "c"].map((s, i) => ({ text_kk: s, text_ru: s, text_en: s, is_correct: i === 0 })), ...extra,
  });
  const run = (who: keyof typeof ids | null, rows: unknown[]) => as(who, async (q) => {
    const subj = (await q<{ id: string }>("select id from public.subjects where slug = 'math'"))[0].id;
    return (await q<{ r: { questions: number; topics: number } }>(
      "select public.import_questions($1, 5, $2::jsonb) as r", [subj, JSON.stringify(rows)]))[0].r;
  });

  it("учитель загружает черновики: тема находится по названию на любом языке или создаётся", async () => {
    const title = (await one<{ title_kk: string }>("select title_kk from public.topics where legacy_key = 'math|5|0'"))!.title_kk;
    const r = await run("teacherA", [row(` ${title.toUpperCase()} `, "Импорт 1"), row("Новая тема из Excel", "Импорт 2"),
      row("новая тема из excel", "Импорт 3")]);
    expect(r).toEqual({ questions: 3, topics: 1 });
    const qs = (await db.query<{ status: string; author_id: string; legacy_key: string | null; n: number }>(`
      select q.status, q.author_id, t.legacy_key, (select count(*)::int from public.options o where o.question_id = q.id) as n
      from public.questions q join public.topics t on t.id = q.topic_id
      where q.text_ru like 'Импорт %' order by q.text_ru`)).rows;
    expect(qs.map((x) => [x.status, x.author_id, x.legacy_key, x.n])).toEqual([
      ["draft", ids.teacherA, "math|5|0", 3], ["draft", ids.teacherA, null, 3], ["draft", ids.teacherA, null, 3]]);
  });

  it("ошибка в одной строке — не сохраняется ничего", async () => {
    const before = (await one<{ n: number }>("select count(*)::int as n from public.questions"))!.n;
    await expect(run("teacherA", [row("Тема X", "Хорошая"), row("", "Без темы")])).rejects.toThrow(/не указана тема/);
    const five = row("Тема X", "Пять вариантов");
    five.options = [...five.options, ...five.options];
    await expect(run("teacherA", [five])).rejects.toThrow(/не больше 4/);
    expect((await one<{ n: number }>("select count(*)::int as n from public.questions"))!.n).toBe(before);
    expect(await one("select 1 from public.topics where title_ru = 'Тема X'")).toBeUndefined();
  });

  it("ученик и аноним загружать не могут", async () => {
    await expect(run("student", [row("Тема Y", "x")])).rejects.toThrow(/row-level security/);
    await expect(run(null, [row("Тема Y", "x")])).rejects.toThrow(/permission denied/);
  });
});

describe("программа класса: разделы и темы (loadCurriculum)", () => {
  const cur: Curriculum = {
    grade: 4,
    subjects: [
      { id: "math", name: ["Математика", "Математика", "Mathematics"], sections: [
        { title: ["Көп таңбалы сандар", "Многозначные числа", "Multi-digit numbers"], topics: [
          ["Сандарды салыстыру", "Сравнение многозначных чисел", "Comparing multi-digit numbers"],
          ["Сандарды дөңгелектеу", "Округление чисел", "Rounding numbers"]] }] },
      { id: "digital", name: ["Цифрлық сауаттылық", "Цифровая грамотность", "Digital literacy"], icon: "01", sections: [
        { title: ["Компьютер", "Компьютер", "The computer"], topics: [
          ["Компьютер құрылғылары", "Устройства компьютера", "Computer devices"]] },
        { title: ["Алгоритмдер", "Алгоритмы", "Algorithms"], topics: [["Цикл", "Цикл", "Loops"]] }] },
    ],
  };
  const load = (force = false) => db.transaction((tx) => loadCurriculum(asDb(tx), cur, { force }));
  const topicsOf = (slug: string) => db.query<{ title_ru: string; sort_order: number; section: string | null }>(`
    select t.title_ru, t.sort_order, s.title_ru as section from public.topics t
    join public.subjects su on su.id = t.subject_id left join public.sections s on s.id = t.section_id
    where su.slug = $1 and t.grade = 4 order by t.sort_order`, [slug]).then((r) => r.rows);

  it("создаёт новый предмет, разделы и темы; старые темы без раздела уходят в конец", async () => {
    const r = await load();
    expect(r.subjects).toEqual({ created: ["digital"], existing: ["math"] });
    expect(r.sections).toEqual({ created: 3, updated: 0 });
    expect(r.topics).toEqual({ created: 4, updated: 0 });
    const math = await topicsOf("math");
    expect(math.slice(0, 2)).toEqual([
      { title_ru: "Сравнение многозначных чисел", sort_order: 0, section: "Многозначные числа" },
      { title_ru: "Округление чисел", sort_order: 1, section: "Многозначные числа" }]);
    expect(math.slice(2).every((x) => x.section === null && x.sort_order >= 2)).toBe(true); // 3 старые темы
    expect(math).toHaveLength(5);
    expect(await one("select icon, name_ru from public.subjects where slug = 'digital'"))
      .toEqual({ icon: "01", name_ru: "Цифровая грамотность" });
  });

  it("повторная загрузка не создаёт дублей и не трогает названия, исправленные в админке", async () => {
    await db.query("update public.topics set title_ru = 'Округление' where title_ru = 'Округление чисел'");
    const r = await load();
    expect(r.subjects.created).toEqual([]);
    expect(r.sections).toEqual({ created: 0, updated: 3 });
    // «Округление» нашлось по казахскому названию и осталось как в админке
    expect(r.topics).toEqual({ created: 0, updated: 4 });
    expect((await topicsOf("math")).map((x) => x.title_ru)).toContain("Округление");
    await load(true); // --force возвращает название из файла
    expect((await topicsOf("math")).map((x) => x.title_ru)).toContain("Округление чисел");
  });

  it("ошибки в файле — ничего не загружается", async () => {
    const bad: Curriculum = { grade: 3, subjects: [{ id: "Bad id", name: ["a", "", "c"] as never, sections: [
      { title: ["x", "x", "x"], topics: [["Цикл", "Цикл", "Loops"], ["Петля", "Цикл", "Loop"]] }] }] };
    expect(validateCurriculum(bad)).toEqual([
      "grade: нужен класс от 4 до 11",
      "предмет Bad id: id — латиница, цифры, _ или -",
      "предмет Bad id: name — три непустых названия (kk, ru, en)",
      "предмет Bad id, раздел 1, тема 2: название «цикл» уже есть в этом предмете",
    ]);
    await expect(db.transaction((tx) => loadCurriculum(asDb(tx), bad))).rejects.toThrow(/Ошибки в файле программы/);
  });

  it("разделы: читают все, создаёт учитель, удаляет только админ", async () => {
    expect((await as(null, (q) => q("select * from public.sections"))).length).toBe(3);
    const subj = (await one<{ id: string }>("select id from public.subjects where slug = 'math'"))!.id;
    const add = (who: keyof typeof ids) => as(who, (q) => q<{ id: string }>(
      "insert into public.sections (subject_id, grade, title_ru) values ($1, 5, 'Раздел') returning id", [subj]));
    await expect(add("student")).rejects.toThrow(/row-level security/);
    const [s] = await add("teacherA");
    expect(await as("teacherA", (q) => q("delete from public.sections where id = $1 returning id", [s.id]))).toEqual([]);
    expect(await as("admin", (q) => q("delete from public.sections where id = $1 returning id", [s.id]))).toHaveLength(1);
    await expect(as(null, (q) => q("insert into public.sections (subject_id, grade, title_ru) values ($1, 5, 'x')", [subj])))
      .rejects.toThrow(/permission denied/);
  });

  it("одна старая тема не совпадает с двумя темами файла (неточный перевод в старых данных)", async () => {
    // Старая тема алгебры 7 кл.: ru «Степень с натуральным показателем», kk «Бүтін көрсеткішті дәреже».
    const g7: Curriculum = { grade: 7, subjects: [{ id: "algebra", name: ["Алгебра", "Алгебра", "Algebra"], sections: [
      { title: ["Дәреже", "Степень", "Powers"], topics: [
        ["Натурал көрсеткішті дәреже", "Степень с натуральным показателем", "Powers with natural exponents"],
        ["Бүтін көрсеткішті дәреже", "Степень с целым показателем", "Powers with integer exponents"]] }] }] };
    const r = await db.transaction((tx) => loadCurriculum(asDb(tx), g7));
    expect(r.topics).toEqual({ created: 1, updated: 1 });
    const rows = (await db.query<{ title_ru: string; legacy_key: string | null }>(`
      select t.title_ru, t.legacy_key from public.topics t join public.subjects s on s.id = t.subject_id
      where s.slug = 'algebra' and t.grade = 7 and t.section_id is not null order by t.sort_order`)).rows;
    expect(rows).toEqual([
      { title_ru: "Степень с натуральным показателем", legacy_key: "algebra|7|0" },
      { title_ru: "Степень с целым показателем", legacy_key: null }]);
  });
});

describe("функции для учеников", () => {
  it("попытка: база сама считает верные ответы и статистику", async () => {
    const qs = (await db.query<{ qid: string; right: string; wrong: string }>(`
      select q.id as qid,
        (select id from public.options where question_id = q.id and is_correct) as right,
        (select id from public.options where question_id = q.id and not is_correct limit 1) as wrong
      from public.questions q join public.topics t on t.id = q.topic_id
      where t.legacy_key = 'math|5|1' order by q.sort_order`)).rows;
    const answers = qs.map((x, i) => ({ question_id: x.qid, option_id: i < 3 ? x.right : x.wrong }));
    const [r] = await as(null, (q) => q<{ r: { ok: boolean; score: number; total: number } }>(
      "select public.submit_attempt(null, 5, null, $1::jsonb) as r", [JSON.stringify(answers)]));
    expect(r.r).toMatchObject({ ok: true, score: 3, total: 5 });
    const st = await one<{ shown_count: string; correct_count: string }>(
      "select * from public.answer_stats where question_id = $1", [qs[0].qid]);
    expect([Number(st!.shown_count), Number(st!.correct_count)]).toEqual([1, 1]);
  });

  it("попытка: чужой вариант и неопубликованный вопрос не засчитываются", async () => {
    const a = await one<{ qid: string }>("select id as qid from public.questions where legacy_key = 'math|5|1|0'");
    const foreign = await one<{ id: string }>(
      "select o.id from public.options o join public.questions q on q.id = o.question_id where q.legacy_key = 'math|5|1|1' and o.is_correct");
    const [r] = await as(null, (q) => q<{ r: { score: number; total: number } }>(
      "select public.submit_attempt(null, 5, null, $1::jsonb) as r",
      [JSON.stringify([{ question_id: a!.qid, option_id: foreign!.id }, { question_id: "00000000-0000-0000-0000-000000000000" }])]));
    expect(r.r).toMatchObject({ score: 0, total: 1 });
  });

  it("аноним не читает попытки, статистику и жалобы", async () => {
    for (const table of ["attempts", "answer_stats", "reports", "question_history", "app_settings"]) {
      await expect(as(null, (q) => q(`select * from public.${table}`))).rejects.toThrow(/permission denied/);
    }
    expect(await as("student", (q) => q("select * from public.answer_stats"))).toEqual([]);
  });

  it("жалоба: сохраняется; поле-ловушка молча отбрасывает; лимит частоты", async () => {
    const qid = (await one<{ id: string }>("select id from public.questions where legacy_key = 'math|5|0|1'"))!.id;
    const report = (msg: string, trap: string | null = null) => as(null, (q) => q<{ r: { ok: boolean; reason?: string } }>(
      "select public.submit_report($1, $2, 'ru', $3) as r", [qid, msg, trap])).then((rows) => rows[0].r);

    expect(await report("В ответе опечатка")).toEqual({ ok: true });
    expect(await report("Я бот", "http://spam")).toEqual({ ok: true });
    expect(await report("а")).toMatchObject({ ok: false, reason: "bad_message" });
    const n = await one<{ n: number }>("select count(*)::int as n from public.reports");
    expect(n!.n).toBe(1);

    await db.query(`update public.app_settings set value = value || '{"reports_per_hour": 2}' where key = 'limits'`);
    expect(await report("Вторая жалоба")).toEqual({ ok: true });
    expect(await report("Третья жалоба")).toMatchObject({ ok: false, reason: "rate_limited" });
  });

  it("служебные функции недоступны через API", async () => {
    await expect(as(null, (q) => q("select public.hit_rate_limit('x', 1, interval '1 hour')")))
      .rejects.toThrow(/permission denied/);
  });
});

describe("картинки", () => {
  it("загружают только учитель и админ", async () => {
    await expect(as("student", (q) => q(
      "insert into storage.objects (bucket_id, name, owner_id) values ('question-images', 'a.png', $1)", [ids.student])))
      .rejects.toThrow(/row-level security/);
    await as("teacherA", (q) => q(
      "insert into storage.objects (bucket_id, name, owner_id) values ('question-images', 'b.png', $1)", [ids.teacherA]));
  });
});

describe("резервная копия (npm run backup / restore)", () => {
  // Строки таблицы в одном порядке — чтобы сравнивать копии.
  const sorted = (rows: unknown[]) => rows.map((r) => JSON.stringify(r)).sort();

  it("таблицы идут по порядку ссылок: тема после предмета, вариант после вопроса", async () => {
    const order = await tablesInOrder(asDb(db));
    expect(order.indexOf("subjects")).toBeLessThan(order.indexOf("topics"));
    expect(order.indexOf("sections")).toBeLessThan(order.indexOf("topics"));
    expect(order.indexOf("questions")).toBeLessThan(order.indexOf("options"));
  });

  it("восстановление возвращает базу ровно к копии и убирает добавленное позже", async () => {
    const before = await dumpDb(asDb(db));
    expect(before.questions.length).toBeGreaterThan(1000);

    await db.transaction((tx) => loadCurriculum(asDb(tx), JSON.parse(
      readFileSync(join(root, "data", "curriculum", "grade11.json"), "utf8")) as Curriculum));
    await db.query("delete from public.options where question_id in (select id from public.questions where status = 'draft')");
    expect((await one<{ n: number }>("select count(*)::int as n from public.topics"))!.n).toBeGreaterThan(before.topics.length);

    await db.transaction((tx) => restoreDb(asDb(tx), before));
    const after = await dumpDb(asDb(db));
    for (const t of Object.keys(before)) expect(sorted(after[t]), t).toEqual(sorted(before[t]));
  });
});

describe("перенос старых вопросов по таблицам docs/gradeN-mapping.md", () => {
  it("таблицы читаются без ошибок: каждый старый вопрос — не больше одного раза, всего 1336", () => {
    const r = readMappings(root);
    expect(r.errors).toEqual([]);
    expect(new Set(r.moves.map((m) => m.questionKey)).size).toBe(r.moves.length);
    expect(r.moves.length + r.kept).toBe(1336);
  });

  it("все новые темы находятся в базе после загрузки программ 4–11; вопросы переезжают в нужный класс", async () => {
    for (let g = 4; g <= 11; g++) {
      await db.transaction((tx) => loadCurriculum(asDb(tx), JSON.parse(
        readFileSync(join(root, "data", "curriculum", `grade${g}.json`), "utf8")) as Curriculum));
    }
    const moves = readMappings(root).moves.filter((m) => m.mark !== "none"); // ⛔ остаются на месте (№66)
    const plan = await planMoves(asDb(db), moves);
    expect(plan.errors).toEqual([]);
    const n = await db.transaction((tx) => applyMoves(asDb(tx), plan.rows));
    expect(n).toBeGreaterThan(1000);
    // Вопрос 6 класса «Ромб в блок-схеме» уехал в 5 класс (№54)
    const m = moves.find((x) => x.file === "grade6-mapping.md" && x.row === "64")!;
    const q = await one<{ grade: number; title_ru: string }>(`select t.grade, t.title_ru from public.questions q
      join public.topics t on t.id = q.topic_id where q.legacy_key = $1`, [m.questionKey]);
    expect(q).toEqual({ grade: 5, title_ru: "Блок-схемы" });
    // повтор ничего не меняет
    expect(await db.transaction((tx) => applyMoves(asDb(tx), plan.rows))).toBe(0);
  }, 60_000);

  it("вопросы ⛔ остаются в старых темах с пометкой «требует проверки учителем»", async () => {
    const none = readMappings(root).moves.filter((m) => m.mark === "none");
    expect(none.length).toBeGreaterThan(0);
    expect(await db.transaction((tx) => markForTeacher(asDb(tx), none))).toBe(none.length);
    const q = await one<{ teacher_check: string; section_id: string | null }>(`select q.teacher_check, t.section_id
      from public.questions q join public.topics t on t.id = q.topic_id where q.legacy_key = $1`, [none[0].questionKey]);
    expect(q!.teacher_check).toMatch(/^Нет подходящей темы в программе\. Предложено: \d+ кл\./);
    expect(q!.section_id).toBeNull();
    expect(await db.transaction((tx) => markForTeacher(asDb(tx), none))).toBe(0); // повтор ничего не меняет
  });

  it("пустые старые темы: без ссылок удаляются, с правками людей — скрываются и не находятся при загрузке из Excel", async () => {
    const subj = (await one<{ id: string }>("select id from public.subjects where slug = 'math'"))!.id;
    const lonely = (await one<{ id: string }>(`insert into public.topics (subject_id, grade, title_ru)
      values ($1, 4, 'Пустая тема без ссылок') returning id`, [subj]))!.id;
    // Тема, вопрос из которой учитель перенёс в админке: в истории — правка человека.
    const edited = (await one<{ id: string }>(`insert into public.topics (subject_id, grade, title_ru)
      values ($1, 4, 'Тема с правкой учителя') returning id`, [subj]))!.id;
    const target = (await one<{ id: string }>(
      "select id from public.topics where subject_id = $1 and section_id is not null limit 1", [subj]))!.id;
    await as("teacherA", async (q) => {
      const [r] = await q<{ id: string }>("insert into public.questions (topic_id, text_ru) values ($1, 'Черновик') returning id", [edited]);
      await q("update public.questions set topic_id = $1 where id = $2", [target, r.id]);
    });

    const list = await emptyOldTopics(asDb(db));
    expect(list.length).toBeGreaterThan(100); // темы, из которых вопросы уехали при переносе
    expect(list.find((t) => t.id === lonely)).toMatchObject({ attempts: 0, reports: 0, stats: 0, history: 0 });
    // Перенос скриптом (история без автора) ссылкой не считается (№68); правка учителя — считается.
    // Остальные скрываемые темы — со статистикой ответов из тестов выше.
    const moved = list.filter(isReferenced);
    expect(moved.map((t) => t.id)).toContain(edited);
    expect(moved.filter((t) => t.id !== edited).every((t) => t.history === 0 && t.stats > 0)).toBe(true);
    const r = await db.transaction((tx) => cleanupOldTopics(asDb(tx), list));
    expect(r).toEqual({ deleted: list.length - moved.length, archived: moved.length });
    expect(await emptyOldTopics(asDb(db))).toEqual([]);

    const hidden = (await one<{ subject_id: string; grade: number; title_ru: string }>(
      "select subject_id, grade, title_ru from public.topics where id = $1 and archived", [edited]))!;
    const res = await as("teacherA", (q) => q<{ r: { topics: number } }>(
      "select public.import_questions($1, $2, $3::jsonb) as r", [hidden.subject_id, hidden.grade, JSON.stringify([{
        topic: hidden.title_ru, text_ru: "Вопрос", options: [{ text_ru: "а", is_correct: true }, { text_ru: "б" }, { text_ru: "в" }],
      }])]));
    expect(res[0].r.topics).toBe(1); // создана новая видимая тема, а не вопрос в скрытой
  });
});

describe("аккаунты: регистрация, роли, блокировка (DECISIONS.md №70–75)", () => {
  let mathId: string;
  let schoolId: string;
  let topicId: string;

  // Создание аккаунта так, как это делает Supabase Auth: строка в auth.users, профиль создаёт триггер.
  async function signUp(email: string, meta: object) {
    const r = await db.query<{ id: string }>(`insert into auth.users (id, email, raw_user_meta_data)
      values (gen_random_uuid(), $1, $2) returning id`, [email, JSON.stringify(meta)]);
    return r.rows[0].id;
  }
  // Регистрация ученика функцией на сервере: простой аккаунт + register_student (ключ service_role).
  async function studentSignUp(nick: string, data: object, email = `${nick}@students.bilimtest.local`) {
    const id = await signUp(email, {});
    try {
      await db.transaction(async (tx) => {
        await tx.exec("set local role service_role");
        await tx.query("select public.register_student($1, $2::jsonb)", [id, JSON.stringify(data)]);
      });
    } catch (e) {
      await db.query("delete from auth.users where id = $1", [id]); // функция на сервере удаляет аккаунт при ошибке
      throw e;
    }
    return id;
  }
  const teacher = (nick: string, extra: object = {}) => ({
    role: "teacher", nickname: nick, first_name: "Айгерим", last_name: "Сейтова", school_id: schoolId,
    subjects: [mathId], grades: [5, 6], consent: true, ...extra,
  });
  const student = (nick: string, extra: object = {}) => ({
    nickname: nick, first_name: "Айдос", grade: 7, consent: true, parent_consent: true, ...extra,
  });
  const setSignup = (v: object) => db.query("update public.app_settings set value = $1 where key = 'signup'", [JSON.stringify(v)]);

  beforeAll(async () => {
    mathId = (await one<{ id: string }>("select id from public.subjects where slug = 'math'"))!.id;
    topicId = (await one<{ id: string }>("select id from public.topics where section_id is not null limit 1"))!.id;
    const region = (await one<{ id: string }>(
      "insert into public.regions (name_kk, name_ru) values ('Тест облысы', 'Тестовая область') returning id"))!.id;
    schoolId = (await one<{ id: string }>(
      "insert into public.schools (region_id, name_ru, approved) values ($1, 'Школа №5', true) returning id", [region]))!.id;
  });

  it("учитель регистрируется с анкетой: роль teacher, предметы и классы сохранены", async () => {
    const id = await signUp("aigerim@mail.kz", teacher("aigerim_t"));
    expect(await one(`select role, nickname, full_name, school_id from public.profiles where id = $1`, [id]))
      .toEqual({ role: "teacher", nickname: "aigerim_t", full_name: "Айгерим Сейтова", school_id: schoolId });
    expect(await one(`select grades from public.teacher_info where user_id = $1`, [id])).toEqual({ grades: [5, 6] });
  });

  it("роль admin выдать себе нельзя; без анкеты и с ловушкой — отказ", async () => {
    await expect(signUp("x1@mail.kz", { ...teacher("nx1"), role: "admin" })).rejects.toThrow(/недопустимая роль/);
    await expect(signUp("x2@mail.kz", { role: "student", ...student("nx2") })).rejects.toThrow(/недопустимая роль/);
    await expect(signUp("x4@mail.kz", teacher("nx4", { website: "http://spam" }))).rejects.toThrow(/отклонена/);
    await expect(signUp("x5@mail.kz", teacher("nx5", { consent: false }))).rejects.toThrow(/согласие/);
    await expect(signUp("x6@mail.kz", teacher("nx6", { subjects: [] }))).rejects.toThrow(/предметы/);
    await expect(signUp("x7@students.bilimtest.local", teacher("nx7"))).rejects.toThrow(/Адрес входа/);
    await expect(signUp("x8@mail.kz", teacher("aigerim_t"))).rejects.toThrow(/duplicate|unique/i); // ник занят
    expect(await one("select count(*)::int as n from auth.users where email like 'x_@%'")).toEqual({ n: 0 });
  });

  it("аккаунт без роли (создал админ) — простой профиль без анкеты; анкету ученика из браузера не заполнить", async () => {
    const id = await signUp("staff@mail.kz", {});
    expect(await one("select role, nickname from public.profiles where id = $1", [id])).toEqual({ role: "student", nickname: null });
    await expect(as("student", (q) => q("select public.register_student($1, $2::jsonb)", [ids.student, "{}"])))
      .rejects.toThrow(/permission denied/);
  });

  it("ученик — только через функцию на сервере и только при открытой регистрации (№70)", async () => {
    await expect(studentSignUp("aidos07", student("aidos07"))).rejects.toThrow(/закрыта/);
    await setSignup({ teacher: true, student: true });
    try {
      await expect(studentSignUp("aidos07", student("aidos07"), "other@students.bilimtest.local")).rejects.toThrow(/Адрес входа/);
      await expect(studentSignUp("aidos08", student("aidos08", { parent_consent: false }))).rejects.toThrow(/16 лет/);
      await expect(studentSignUp("aidos09", student("aidos09", { website: "x" }))).rejects.toThrow(/отклонена/);
      const id = await studentSignUp("aidos07", student("aidos07", { recovery_email: "Mama@Mail.kz" }));
      expect(await one("select role from public.profiles where id = $1", [id])).toEqual({ role: "student" });
      expect(await one("select grade, recovery_email from school.students where user_id = $1", [id]))
        .toEqual({ grade: 7, recovery_email: "mama@mail.kz" });
    } finally {
      await setSignup({ teacher: true, student: false });
    }
    expect(await as(null, (q) => q<{ r: unknown }>("select public.signup_open() as r")))
      .toEqual([{ r: { teacher: true, student: false } }]);
  });

  it("ученик видит только себя; роль и ник сам не меняет; учитель данных учеников не видит", async () => {
    const sid = (await one<{ id: string }>("select id from public.profiles where nickname = 'aidos07'"))!.id;
    const tid = (await one<{ id: string }>("select id from public.profiles where nickname = 'aigerim_t'"))!.id;
    const asUser = async <T>(uid: string, fn: (q: Db["query"]) => Promise<T>) => db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
      await tx.exec("set local role authenticated");
      return fn(asDb(tx).query);
    });
    expect(await asUser(sid, (q) => q("select id from public.profiles"))).toEqual([{ id: sid }]);
    expect(await asUser(sid, (q) => q("select user_id from public.teacher_info"))).toEqual([]);
    expect(await asUser(sid, (q) => q("select grade from school.students"))).toEqual([{ grade: 7 }]);
    await expect(asUser(sid, (q) => q("update public.profiles set role = 'admin' where id = $1", [sid])))
      .rejects.toThrow(/permission denied/);
    await expect(asUser(sid, (q) => q("update public.profiles set nickname = 'boss' where id = $1", [sid])))
      .rejects.toThrow(/permission denied/);
    await expect(asUser(sid, (q) => q("select public.set_user_role($1, 'admin')", [sid]))).rejects.toThrow(/только админ/);
    await asUser(sid, (q) => q("update school.students set grade = 8 where user_id = $1", [sid]));
    expect(await one("select grade from school.students where user_id = $1", [sid])).toEqual({ grade: 8 });

    expect(await asUser(tid, (q) => q("select user_id from school.students"))).toEqual([]);
    expect(await asUser(tid, (q) => q("select id from public.profiles"))).toEqual([{ id: tid }]);
    expect(await as("admin", (q) => q("select user_id from school.students"))).toEqual([{ user_id: sid }]);
  });

  it("лимит черновиков учителя в сутки (с Excel), админ без лимита; блокировка снимает права", async () => {
    await db.query("update public.app_settings set value = value || '{\"teacher_drafts_per_day\": 2}' where key = 'limits'");
    const draft = (q: Db["query"], author: string) => q(
      "insert into public.questions (topic_id, text_ru, author_id) values ($1, 'Черновик', $2)", [topicId, author]);
    try {
      await as("teacherB", (q) => draft(q, ids.teacherB));
      await as("teacherB", (q) => draft(q, ids.teacherB));
      await expect(as("teacherB", (q) => draft(q, ids.teacherB))).rejects.toThrow(/лимит черновиков: 2/);
      await expect(as("teacherB", (q) => q("select public.import_questions($1, 5, $2::jsonb)", [mathId, JSON.stringify([{
        topic: "Тема", text_ru: "В", options: [{ text_ru: "а", is_correct: true }, { text_ru: "б" }, { text_ru: "в" }] }])])))
        .rejects.toThrow(/лимит/);
      for (let i = 0; i < 3; i++) await as("admin", (q) => draft(q, ids.admin));
    } finally {
      await db.query("update public.app_settings set value = value || '{\"teacher_drafts_per_day\": 50}' where key = 'limits'");
    }

    await expect(as("teacherA", (q) => q("select public.set_user_blocked($1, true)", [ids.teacherB]))).rejects.toThrow(/только админ/);
    await expect(as("admin", (q) => q("select public.set_user_blocked($1, true)", [ids.admin]))).rejects.toThrow(/себя/);
    await as("admin", (q) => q("select public.set_user_blocked($1, true)", [ids.teacherB]));
    expect(await one("select banned_until > now() as banned from auth.users where id = $1", [ids.teacherB])).toEqual({ banned: true });
    await expect(as("teacherB", (q) => draft(q, ids.teacherB))).rejects.toThrow(/row-level security/);
    await as("admin", (q) => q("select public.set_user_blocked($1, false)", [ids.teacherB]));
    expect(await one("select banned_until from auth.users where id = $1", [ids.teacherB])).toEqual({ banned_until: null });
  });

  it("кабинет /me: ученик читает и меняет свой класс; у учителя класса нет; аноним не вызывает", async () => {
    const sid = (await one<{ id: string }>("select id from public.profiles where nickname = 'aidos07'"))!.id;
    const tid = (await one<{ id: string }>("select id from public.profiles where role = 'teacher' limit 1"))!.id;
    const as = (id: string | null, sql: string) => db.transaction(async (tx) => {
      if (id) await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [id]);
      await tx.exec(`set local role ${id ? "authenticated" : "anon"}`);
      return (await tx.query<Record<string, unknown>>(sql)).rows[0];
    });
    await as(sid, "select public.set_my_grade(9::smallint)");
    expect(await as(sid, "select public.my_grade() as g")).toEqual({ g: 9 });
    await expect(as(sid, "select public.set_my_grade(12::smallint)")).rejects.toThrow(/check/);
    await expect(as(tid, "select public.set_my_grade(5::smallint)")).rejects.toThrow(/только у ученика/);
    expect(await as(tid, "select public.my_grade() as g")).toEqual({ g: null });
    await expect(as(null, "select public.my_grade()")).rejects.toThrow(/permission denied/);
  });

  it("ученик удаляет свой аккаунт вместе с данными", async () => {
    const sid = (await one<{ id: string }>("select id from public.profiles where nickname = 'aidos07'"))!.id;
    await db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [sid]);
      await tx.exec("set local role authenticated");
      await tx.query("select public.delete_my_account()");
    });
    expect(await one("select count(*)::int as n from auth.users where id = $1", [sid])).toEqual({ n: 0 });
    expect(await one("select count(*)::int as n from public.profiles where id = $1", [sid])).toEqual({ n: 0 });
    expect(await one("select count(*)::int as n from school.students where user_id = $1", [sid])).toEqual({ n: 0 });
  });
});

describe("справочник: области и школы (№77)", () => {
  it("20 областей и городов республиканского значения; дубль в одной области запрещён; школы добавляет админ", async () => {
    expect(await one("select count(*)::int as n from public.regions where parent_id is null and name_ru not like 'Тест%'"))
      .toEqual({ n: 20 });
    const astana = (await one<{ id: string }>("select id from public.regions where name_ru = 'Астана'"))!.id;
    await as("admin", (q) => q("insert into public.regions (parent_id, name_kk, name_ru) values ($1, 'Есіл ауданы', 'район Есиль')", [astana]));
    await expect(as("admin", (q) => q(
      "insert into public.regions (parent_id, name_kk, name_ru) values ($1, 'Есіл', 'район Есиль')", [astana]))).rejects.toThrow(/duplicate|unique/i);
    await expect(as("teacherA", (q) => q(
      "insert into public.schools (region_id, name_ru, approved) values ($1, 'Школа', true)", [astana]))).rejects.toThrow(/row-level security/);
    await as("admin", (q) => q("insert into public.schools (region_id, name_ru) values ($1, 'Непроверенная школа')", [astana]));
    expect(await as(null, (q) => q("select name_ru from public.schools where region_id = $1", [astana]))).toEqual([]);
  });
});

describe("«Пользователи» и пилот (№79–83)", () => {
  const asService = <T>(fn: (q: Db["query"]) => Promise<T>) => db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return fn(asDb(tx).query);
  });
  const asUser = <T>(uid: string, fn: (q: Db["query"]) => Promise<T>) => db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
    await tx.exec("set local role authenticated");
    return fn(asDb(tx).query);
  });
  const newUser = async (email: string) => (await one<{ id: string }>(
    "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id", [email]))!.id;

  it("setup_teacher (только сервер): анкета, роль teacher, временный пароль нужно сменить", async () => {
    const math = (await one<{ id: string }>("select id from public.subjects where slug = 'math'"))!.id;
    const id = await newUser("bolat@mail.kz");
    const data = { nickname: "Bolat_T", first_name: "Болат", last_name: "Ахметов", school_other: "Школа №7, Семей",
      subjects: [math], grades: [7, 8] };
    await expect(as("admin", (q) => q("select public.setup_teacher($1, $2::jsonb)", [id, JSON.stringify(data)])))
      .rejects.toThrow(/permission denied/); // из браузера даже админ не может — только сервер
    await expect(asService((q) => q("select public.setup_teacher($1, $2::jsonb)", [id, JSON.stringify({ ...data, subjects: [] })])))
      .rejects.toThrow(/предметы/);
    await asService((q) => q("select public.setup_teacher($1, $2::jsonb)", [id, JSON.stringify(data)]));
    expect(await one(`select role, nickname, full_name, school_other, must_change_password from public.profiles
      where id = $1`, [id])).toEqual({ role: "teacher", nickname: "bolat_t", full_name: "Болат Ахметов",
      school_other: "Школа №7, Семей", must_change_password: true });
    await expect(asService((q) => q("select public.setup_teacher($1, $2::jsonb)", [id, JSON.stringify(data)])))
      .rejects.toThrow(/уже настроен/);

    await asUser(id, (q) => q("select public.password_changed()"));
    expect(await one("select must_change_password from public.profiles where id = $1", [id])).toEqual({ must_change_password: false });
  });

  it("список пользователей с email видит только админ; поиск и фильтр по роли", async () => {
    await expect(as("teacherA", (q) => q("select * from public.admin_users()"))).rejects.toThrow(/Только для админа/);
    const all = await as("admin", (q) => q<{ email: string }>("select email from public.admin_users()"));
    expect(all.length).toBeGreaterThan(3);
    expect(await as("admin", (q) => q("select nickname, email from public.admin_users('болат')")))
      .toEqual([{ nickname: "bolat_t", email: "bolat@mail.kz" }]);
    const teachers = await as("admin", (q) => q<{ role: string }>("select role from public.admin_users(null, 'teacher')"));
    expect(teachers.length).toBeGreaterThan(0);
    expect(teachers.every((r) => r.role === "teacher")).toBe(true);
  });

  it("упрощённая регистрация ученика: ник, класс, согласие — без имени; лимит частоты по IP", async () => {
    await db.query(`update public.app_settings set value = '{"teacher": false, "student": true}' where key = 'signup'`);
    await db.query(`update public.app_settings set value = value || '{"student_signups_per_hour": 2}' where key = 'limits'`);
    try {
      const id = await newUser("pilot_kid@students.bilimtest.local");
      await asService((q) => q("select public.register_student($1, $2::jsonb)", [id, JSON.stringify({
        nickname: "pilot_kid", grade: 6, consent: true, parent_consent: true })]));
      expect(await one("select role, nickname, first_name from public.profiles where id = $1", [id]))
        .toEqual({ role: "student", nickname: "pilot_kid", first_name: "" });

      const ok = (ip: string) => asService((q) => q<{ ok: boolean }>("select public.signup_rate_ok($1) as ok", [ip]));
      expect(await ok("1.2.3.4")).toEqual([{ ok: true }]);
      expect(await ok("1.2.3.4")).toEqual([{ ok: true }]);
      expect(await ok("1.2.3.4")).toEqual([{ ok: false }]); // третья за час с одного адреса
      expect(await ok("5.6.7.8")).toEqual([{ ok: true }]);
      await expect(as(null, (q) => q("select public.signup_rate_ok('x')"))).rejects.toThrow(/permission denied/);
    } finally {
      await db.query(`update public.app_settings set value = '{"teacher": true, "student": false}' where key = 'signup'`);
      await db.query(`update public.app_settings set value = value || '{"student_signups_per_hour": 60}' where key = 'limits'`);
    }
  });
});
