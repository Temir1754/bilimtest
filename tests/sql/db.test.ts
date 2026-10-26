// Проверка миграций, правил доступа (RLS) и импорта на локальном Postgres (PGlite).
// Служебные части Supabase заменены упрощённой копией (supabase-stub.sql).
// Те же правила дополнительно проверяются на настоящем тестовом проекте: npm run test:db.
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { importSubjects, type Db } from "../../scripts/importer";
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
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@test.local`]);
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
    await expect(save("admin", id, full("published", { text_en: "" }), opts(0))).rejects.toThrow(/на языке en/);
    await expect(save("admin", id, full("draft"), opts(0, 5))).rejects.toThrow(/не больше 4/);
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
