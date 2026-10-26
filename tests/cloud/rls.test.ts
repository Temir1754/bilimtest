// Проверка правил доступа на настоящем тестовом проекте Supabase (через тот же API, что и сайт).
// Запуск: npm run test:db. Нужны TEST_* в .env. Тесты стирают данные тестового проекта!
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importSubjects } from "../../scripts/importer";
import { readData } from "../../scripts/env";

const env = (n: string) => process.env[n]?.trim() ?? "";
const url = env("TEST_SUPABASE_URL");
const publishable = env("TEST_SUPABASE_PUBLISHABLE_KEY");
const secret = env("TEST_SUPABASE_SECRET_KEY");
const dbUrl = env("TEST_DB_URL");
const configured = Boolean(url && publishable && secret && dbUrl);
if (configured && dbUrl === env("SUPABASE_DB_URL")) throw new Error("TEST_DB_URL совпадает с основной базой!");

const PASSWORD = "Test-password-123!";
const people = { admin: "admin", teacherA: "teacher", teacherB: "teacher", student: "student" } as const;
type Who = keyof typeof people;
const email = (w: Who) => `${w.toLowerCase()}@bilimtest.test`;

let sql: postgres.Sql;
const clients = {} as Record<Who, SupabaseClient>;
const anon = () => createClient(url, publishable, { auth: { persistSession: false } });

describe.skipIf(!configured)("Supabase: правила доступа", () => {
  let topicId: string;
  let draftId: string;

  beforeAll(async () => {
    sql = postgres(dbUrl, { ssl: "require", prepare: false, onnotice: () => {} });
    // Чистим следы прошлых запусков.
    await sql`delete from public.questions where legacy_key is null`;
    await sql`delete from public.sections where title_ru = 'Раздел-тест'`;
    await sql`delete from public.topics where legacy_key is null`;
    await sql`truncate public.reports, public.attempts, public.answer_stats, public.rate_limits, public.question_history`;
    await sql`delete from auth.users where email like '%@bilimtest.test'`;

    const admin = createClient(url, secret, { auth: { persistSession: false } });
    for (const w of Object.keys(people) as Who[]) {
      const { error } = await admin.auth.admin.createUser({ email: email(w), password: PASSWORD, email_confirm: true });
      if (error) throw error;
      await sql`update public.profiles p set role = ${people[w]} from auth.users u
        where u.id = p.id and u.email = ${email(w)}`;
      const c = anon();
      const { error: e2 } = await c.auth.signInWithPassword({ email: email(w), password: PASSWORD });
      if (e2) throw e2;
      clients[w] = c;
    }
  }, 120_000);

  afterAll(async () => {
    await sql?.end();
  });

  it("импорт: 16 / 267 / 1336, повторный запуск без дублей", async () => {
    const raws = readData().map((f) => f.raw);
    const run = () => sql.begin((tx) => importSubjects({ query: (q, p) => tx.unsafe(q, p as never[]) as never }, raws));
    await run();
    const r = await run();
    expect(r.inserted).toEqual({ subjects: 0, topics: 0, questions: 0, options: 0 });
    expect(r.found).toEqual({ subjects: 16, topics: 267, questions: 1336 });
    topicId = (await sql`select id from public.topics where legacy_key = 'math|5|0'`)[0].id;
  }, 120_000);

  it("учитель создаёт черновик", async () => {
    const { data, error } = await clients.teacherA.from("questions")
      .insert({ topic_id: topicId, text_kk: "К", text_ru: "Черновик", text_en: "D" }).select("id").single();
    expect(error).toBeNull();
    draftId = data!.id;
    const { error: e2 } = await clients.teacherA.from("options").insert([0, 1, 2].map((i) => ({
      question_id: draftId, sort_order: i, is_correct: i === 0, text_kk: `${i}`, text_ru: `${i}`, text_en: `${i}`,
    })));
    expect(e2).toBeNull();
  });

  it("аноним и ученик не видят черновики", async () => {
    for (const c of [anon(), clients.student, clients.teacherB]) {
      const { data } = await c.from("questions").select("id").eq("id", draftId);
      expect(data).toEqual([]);
      const { data: notPublished } = await c.from("questions").select("id").neq("status", "published").limit(1);
      expect(notPublished).toEqual([]);
    }
  });

  it("аноним и ученик не могут писать в questions", async () => {
    for (const c of [anon(), clients.student]) {
      const { error } = await c.from("questions").insert({ topic_id: topicId, text_ru: "x" });
      expect(error?.code).toBe("42501");
      const { data } = await c.from("questions").update({ text_ru: "взлом" }).eq("legacy_key", "math|5|0|0").select("id");
      expect(data ?? []).toEqual([]);
    }
    expect((await sql`select 1 from public.questions where text_ru = 'взлом'`).length).toBe(0);
  });

  it("учитель не публикует, админ публикует", async () => {
    const { error } = await clients.teacherA.from("questions").update({ status: "published" }).eq("id", draftId);
    expect(error?.code).toBe("42501");
    const { error: e2 } = await clients.admin.from("questions").update({ status: "published" }).eq("id", draftId);
    expect(e2).toBeNull();
  });

  it("роль нельзя выдать себе самому", async () => {
    const { data: { user } } = await clients.student.auth.getUser();
    const { error } = await clients.student.from("profiles").update({ role: "admin" }).eq("id", user!.id);
    expect(error?.code).toBe("42501");
    const { error: e2 } = await clients.teacherA.rpc("set_user_role", { p_user: draftId, p_role: "admin" });
    expect(e2).not.toBeNull();
  });

  it("разделы: читают все, создаёт учитель, удаляет только админ", async () => {
    const subj = (await sql`select id from public.subjects where slug = 'math'`)[0].id;
    expect((await anon().from("sections").select("id").limit(1)).error).toBeNull();
    const row = { subject_id: subj, grade: 5, title_ru: "Раздел-тест" };
    expect((await clients.student.from("sections").insert(row)).error?.code).toBe("42501");
    const { data, error } = await clients.teacherA.from("sections").insert(row).select("id").single();
    expect(error).toBeNull();
    const del = (c: SupabaseClient) => c.from("sections").delete().eq("id", data!.id).select("id");
    expect((await del(clients.teacherA)).data).toEqual([]);
    expect((await del(clients.admin)).data).toHaveLength(1);
  });

  it("save_question: учитель не публикует через функцию", async () => {
    const { error } = await clients.teacherA.rpc("save_question", {
      p_id: null, p_q: { topic_id: topicId, text_kk: "a", text_ru: "a", text_en: "a", status: "published" },
      p_options: [0, 1, 2].map((i) => ({ text_kk: `${i}`, text_ru: `${i}`, text_en: `${i}`, is_correct: i === 0 })),
    });
    expect(error?.code).toBe("42501");
  });

  it("аноним отправляет попытку и жалобу, но не читает их", async () => {
    const qs = await sql`select q.id, (select id from public.options where question_id = q.id and is_correct) as right
      from public.questions q where q.legacy_key like 'math|5|1|%' order by q.sort_order`;
    const c = anon();
    const { data } = await c.rpc("submit_attempt", {
      p_subject_id: null, p_grade: 5, p_topic_id: null,
      p_answers: qs.map((q) => ({ question_id: q.id, option_id: q.right })),
    });
    expect(data).toMatchObject({ ok: true, score: 5, total: 5 });

    const r = await c.rpc("submit_report", { p_question_id: qs[0].id, p_message: "Опечатка", p_lang: "ru", p_trap: null });
    expect(r.data).toEqual({ ok: true });
    const trap = await c.rpc("submit_report", { p_question_id: qs[0].id, p_message: "spam", p_lang: "ru", p_trap: "x" });
    expect(trap.data).toEqual({ ok: true });
    expect((await sql`select count(*)::int as n from public.reports`)[0].n).toBe(1);

    for (const table of ["attempts", "reports", "answer_stats"]) {
      const { error } = await c.from(table).select("*").limit(1);
      expect(error?.code).toBe("42501");
    }
    const { error } = await c.rpc("hit_rate_limit", { p_bucket: "x", p_max: 1, p_window: "1 hour" });
    expect(error).not.toBeNull();
  });
});
