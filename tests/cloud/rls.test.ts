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
    await sql`delete from auth.users where email like '%@bilimtest.test' or email like '%@students.bilimtest.local'`;

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

  it("«Сұрақтар» в 3 шага (№87–89): вопрос только на казахском публикуется; подсчёт по языку; учитель удаляет свой черновик", async () => {
    const kkOnly = [0, 1, 2].map((i) => ({ text_kk: `ж${i}`, is_correct: i === 0 }));
    const { data: id, error } = await clients.admin.rpc("save_question", {
      p_id: null, p_q: { topic_id: topicId, text_kk: "Тек қазақша", status: "published" }, p_options: kkOnly });
    expect(error).toBeNull();
    const count = async (lang: string) => ((await clients.teacherA.rpc("topic_counts", { p_grade: 5, p_lang: lang })).data as
      { topic_id: string; ready: number }[]).find((x) => x.topic_id === topicId)!.ready;
    expect(await count("kk")).toBeGreaterThan(await count("en"));
    expect((await clients.teacherA.rpc("topic_min_questions")).data).toBe(5);
    await sql`delete from public.questions where id = ${id as string}`;

    const { data: mine } = await clients.teacherA.from("questions").insert({ topic_id: topicId, text_kk: "Өшіремін" }).select("id").single();
    expect((await clients.teacherB.from("questions").delete().eq("id", mine!.id).select("id")).data).toEqual([]);
    expect((await clients.teacherA.from("questions").delete().eq("id", mine!.id).select("id")).data).toHaveLength(1);
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

describe.skipIf(!configured)("Supabase: аккаунты (DECISIONS.md №70–75)", () => {
  const admin = () => createClient(url, secret, { auth: { persistSession: false } });

  beforeAll(() => {
    sql ??= postgres(dbUrl, { ssl: "require", prepare: false, onnotice: () => {} });
  });

  it("регистрация с ролью admin или student через обычную форму отклоняется базой", async () => {
    for (const role of ["admin", "student"]) {
      const em = `signup-${role}@bilimtest.test`;
      const { error } = await anon().auth.signUp({ email: em, password: PASSWORD, options: { data: {
        role, nickname: `hack_${role}`, first_name: "X", last_name: "Y", consent: true, grade: 7, parent_consent: true,
      } } });
      expect(error).not.toBeNull();
      expect((await sql`select count(*)::int as n from auth.users where email = ${em}`)[0].n).toBe(0);
    }
  });

  it("ученик, созданный функцией на сервере: видит только свой профиль; анкеты учителей не видит", async () => {
    await sql`update public.app_settings set value = '{"teacher": true, "student": true}' where key = 'signup'`;
    try {
      // как функция на сервере student-signup: простой аккаунт, затем анкета через register_student
      const srv = admin();
      const { data, error } = await srv.auth.admin.createUser({
        email: "cloud_kid@students.bilimtest.local", password: PASSWORD, email_confirm: true });
      expect(error).toBeNull();
      const { error: e2 } = await srv.rpc("register_student", { p_user: data.user!.id, p_data: {
        nickname: "cloud_kid", first_name: "Айдос", grade: 7, consent: true, parent_consent: true } });
      expect(e2).toBeNull();
      // из браузера анкету не заполнить
      expect((await anon().rpc("register_student", { p_user: data.user!.id, p_data: {} })).error).not.toBeNull();
    } finally {
      await sql`update public.app_settings set value = '{"teacher": true, "student": false}' where key = 'signup'`;
    }
    const kid = anon();
    expect((await kid.auth.signInWithPassword({ email: "cloud_kid@students.bilimtest.local", password: PASSWORD })).error).toBeNull();
    const { data } = await kid.from("profiles").select("nickname, role");
    expect(data).toEqual([{ nickname: "cloud_kid", role: "student" }]);
    expect((await kid.from("teacher_info").select("user_id")).data).toEqual([]);
    expect((await kid.from("profiles").update({ nickname: "boss" }).eq("nickname", "cloud_kid")).error?.code).toBe("42501");
  });

  it("блокировка запрещает вход; разблокировка возвращает", async () => {
    const { data: { user } } = await clients.teacherB.auth.getUser();
    expect((await clients.teacherA.rpc("set_user_blocked", { p_user: user!.id, p_blocked: true })).error).not.toBeNull();
    expect((await clients.admin.rpc("set_user_blocked", { p_user: user!.id, p_blocked: true })).error).toBeNull();
    const { error } = await anon().auth.signInWithPassword({ email: email("teacherB"), password: PASSWORD });
    expect(error?.message).toMatch(/banned/i);
    expect((await clients.admin.rpc("set_user_blocked", { p_user: user!.id, p_blocked: false })).error).toBeNull();
    expect((await anon().auth.signInWithPassword({ email: email("teacherB"), password: PASSWORD })).error).toBeNull();
  });

  it("загрузка из файла (№91): тема программы по id, вопрос помечен imported; тема другого класса — отказ", async () => {
    const math = (await sql`select id from public.subjects where slug = 'math'`)[0].id;
    const row = (topic_id: string) => [{ topic_id, text_ru: "Из Word", options: [
      { text_ru: "а", is_correct: true }, { text_ru: "б" }, { text_ru: "в" }] }];
    const topic = (await sql`select id from public.topics where subject_id = ${math} and grade = 5 and not archived limit 1`)[0].id;
    const { data, error } = await clients.teacherA.rpc("import_questions", { p_subject_id: math, p_grade: 5, p_rows: row(topic) });
    expect(error).toBeNull();
    expect(data).toEqual({ questions: 1, topics: 0, published: 0 });
    expect((await sql`select imported, status from public.questions where text_ru = 'Из Word'`)[0]).toEqual({ imported: true, status: "draft" });
    const other = (await sql`select id from public.topics where subject_id = ${math} and grade = 6 limit 1`)[0].id;
    const bad = await clients.teacherA.rpc("import_questions", { p_subject_id: math, p_grade: 5, p_rows: row(other) });
    expect(bad.error?.message).toMatch(/Тема не найдена/);
  });

  it("«Пайдаланушылар» (№90): плитки, список и правка данных — только админ", async () => {
    const { data: { user } } = await clients.teacherB.auth.getUser();
    for (const c of [anon(), clients.student, clients.teacherA]) {
      expect((await c.rpc("admin_user_stats")).error).not.toBeNull();
      expect((await c.rpc("admin_users", { p_school: null })).error).not.toBeNull();
      expect((await c.rpc("admin_update_user", { p_user: user!.id, p_data: { first_name: "Х" } })).error).not.toBeNull();
    }
    const { data: stats, error } = await clients.admin.rpc("admin_user_stats");
    expect(error).toBeNull();
    expect(stats.teachers).toBeGreaterThanOrEqual(2);
    const { data: rows } = await clients.admin.rpc("admin_users", { p_role: "teacher", p_school: null });
    expect(rows.find((r: { id: string }) => r.id === user!.id)).toMatchObject({ q_total: expect.any(Number) });
  });

  it("доверенный учитель (№94): метку ставит админ; доверенный публикует свои вопросы без ошибок", async () => {
    const { data: { user } } = await clients.teacherA.auth.getUser();
    expect((await clients.teacherA.rpc("admin_set_trusted", { p_user: user!.id, p_trusted: true })).error).not.toBeNull();
    const math = (await sql`select id from public.subjects where slug = 'math'`)[0].id;
    const topic = (await sql`select id from public.topics where subject_id = ${math} and grade = 5 and not archived limit 1`)[0].id;
    const load = () => clients.teacherA.rpc("import_questions", { p_subject_id: math, p_grade: 5, p_publish: true, p_rows: [
      { topic_id: topic, text_ru: "Доверие", options: [{ text_ru: "а", is_correct: true }, { text_ru: "б" }, { text_ru: "в" }] }] });
    expect((await load()).data).toMatchObject({ published: 0 }); // пока не доверенный — черновик
    expect((await clients.admin.rpc("admin_set_trusted", { p_user: user!.id, p_trusted: true })).error).toBeNull();
    try {
      expect((await load()).data).toMatchObject({ published: 1 });
      const { data: rows } = await clients.admin.rpc("admin_users", { p_role: "teacher", p_school: null });
      expect(rows.find((r: { id: string }) => r.id === user!.id)).toMatchObject({ trusted: true });
    } finally {
      await clients.admin.rpc("admin_set_trusted", { p_user: user!.id, p_trusted: false });
    }
  });

  it("пользователь удаляет свой аккаунт", async () => {
    const em = "delete-me@bilimtest.test";
    expect((await admin().auth.admin.createUser({ email: em, password: PASSWORD, email_confirm: true })).error).toBeNull();
    const c = anon();
    expect((await c.auth.signInWithPassword({ email: em, password: PASSWORD })).error).toBeNull();
    expect((await c.rpc("delete_my_account")).error).toBeNull();
    expect((await sql`select count(*)::int as n from auth.users where email = ${em}`)[0].n).toBe(0);
  });
});

describe.skipIf(!configured)("Supabase: функции на сервере admin-users и student-signup (№80–83)", () => {
  // Ответ функции: данные или код ошибки из { error: "..." }.
  async function call(c: SupabaseClient, name: string, body: object): Promise<{ data?: Record<string, string>; code?: string }> {
    const { data, error } = await c.functions.invoke(name, { body });
    if (!error) return { data };
    const j = await (error as { context?: Response }).context?.json().catch(() => null);
    return { code: j?.error ?? error.message };
  }
  const setSignup = (student: boolean) =>
    sql`update public.app_settings set value = ${sql.json({ teacher: false, student })} where key = 'signup'`;

  beforeAll(async () => {
    sql ??= postgres(dbUrl, { ssl: "require", prepare: false, onnotice: () => {} });
    await sql`delete from auth.users where email in ('fn-teacher@bilimtest.test')`;
  });

  it("создать учителя может только админ; учитель входит с временным паролем и меняет его; сброс пароля", async () => {
    const math = (await sql`select id from public.subjects where slug = 'math'`)[0].id;
    const data = { nickname: "fn_teacher", first_name: "Болат", last_name: "Ахметов", school_id: null,
      school_other: "Школа №7", subjects: [math], grades: [5, 6] };
    expect((await call(clients.teacherA, "admin-users", { action: "create_teacher", email: "fn-teacher@bilimtest.test", data })).code)
      .toBe("forbidden");
    expect((await call(anon(), "admin-users", { action: "create_teacher", email: "fn-teacher@bilimtest.test", data })).code)
      .toBe("forbidden");

    const r = await call(clients.admin, "admin-users", { action: "create_teacher", email: "fn-teacher@bilimtest.test", data });
    expect(r.code).toBeUndefined();
    const temp = r.data!.password;
    expect(temp).toMatch(/^[a-z2-9]{10}$/);
    expect((await call(clients.admin, "admin-users", { action: "create_teacher", email: "fn-teacher@bilimtest.test", data })).code)
      .toBe("email_taken");

    const t = anon();
    expect((await t.auth.signInWithPassword({ email: "fn-teacher@bilimtest.test", password: temp })).error).toBeNull();
    expect((await t.from("profiles").select("role, nickname, must_change_password").single()).data)
      .toEqual({ role: "teacher", nickname: "fn_teacher", must_change_password: true });
    expect((await t.auth.updateUser({ password: "Teacher-own-pass-1" })).error).toBeNull();
    expect((await t.rpc("password_changed")).error).toBeNull();
    expect((await t.from("profiles").select("must_change_password").single()).data).toEqual({ must_change_password: false });

    const reset = await call(clients.admin, "admin-users", { action: "reset_password", user_id: r.data!.id });
    expect(reset.code).toBeUndefined();
    expect((await anon().auth.signInWithPassword({ email: "fn-teacher@bilimtest.test", password: "Teacher-own-pass-1" })).error)
      .not.toBeNull();
    expect((await anon().auth.signInWithPassword({ email: "fn-teacher@bilimtest.test", password: reset.data!.password })).error)
      .toBeNull();
  }, 60_000);

  it("регистрация ученика: закрыта / открыта; ник занят; ловушка; лимит частоты; затем вход по нику", async () => {
    const kid = { nickname: "fn_kid", password: "Kid-pass-123", grade: 7, consent: true, website: "" };
    await setSignup(false);
    expect((await call(anon(), "student-signup", kid)).code).toBe("closed");
    await setSignup(true);
    try {
      expect((await call(anon(), "student-signup", { ...kid, nickname: "Иван" })).code).toBe("bad_nickname");
      expect((await call(anon(), "student-signup", kid)).data).toEqual({ ok: true });
      expect((await call(anon(), "student-signup", kid)).code).toBe("nick_taken");
      expect((await call(anon(), "student-signup", { ...kid, nickname: "fn_bot", website: "http://spam" })).data).toEqual({ ok: true });
      expect((await sql`select count(*)::int as n from auth.users where email = 'fn_bot@students.bilimtest.local'`)[0].n).toBe(0);

      const c = anon();
      expect((await c.auth.signInWithPassword({ email: "fn_kid@students.bilimtest.local", password: kid.password })).error).toBeNull();
      expect((await c.from("profiles").select("role, nickname, first_name").single()).data)
        .toEqual({ role: "student", nickname: "fn_kid", first_name: "" });

      await sql`update public.app_settings set value = value || '{"student_signups_per_hour": 0}' where key = 'limits'`;
      expect((await call(anon(), "student-signup", { ...kid, nickname: "fn_kid2" })).code).toBe("rate_limited");
    } finally {
      await sql`update public.app_settings set value = value || '{"student_signups_per_hour": 60}' where key = 'limits'`;
      await setSignup(false);
    }
  }, 60_000);

  it("кабинет /me: ученик меняет класс и ник — вход по новому нику; занятый ник и учитель — отказ", async () => {
    await setSignup(true);
    try {
      const kid = { password: "Kid-pass-123", grade: 6, consent: true, website: "" };
      expect((await call(anon(), "student-signup", { ...kid, nickname: "fn_me" })).data).toEqual({ ok: true });
      expect((await call(anon(), "student-signup", { ...kid, nickname: "fn_me_other" })).data).toEqual({ ok: true });
    } finally {
      await setSignup(false);
    }
    const c = anon();
    expect((await c.auth.signInWithPassword({ email: "fn_me@students.bilimtest.local", password: "Kid-pass-123" })).error).toBeNull();
    expect((await c.rpc("set_my_grade", { p_grade: 9 })).error).toBeNull();
    expect((await c.rpc("my_grade")).data).toBe(9);
    expect((await clients.teacherA.rpc("set_my_grade", { p_grade: 9 })).error).not.toBeNull();

    expect((await call(c, "account", { action: "change_nickname", nickname: "fn_me_other" })).code).toBe("nick_taken");
    expect((await call(c, "account", { action: "change_nickname", nickname: "Иван" })).code).toBe("bad_nickname");
    expect((await call(clients.teacherA, "account", { action: "change_nickname", nickname: "fn_t" })).code).toBe("forbidden");
    expect((await call(anon(), "account", { action: "change_nickname", nickname: "fn_x" })).code).toBe("forbidden");
    expect((await call(c, "account", { action: "change_nickname", nickname: "fn_me_new" })).data).toEqual({ ok: true });

    expect((await anon().auth.signInWithPassword({ email: "fn_me@students.bilimtest.local", password: "Kid-pass-123" })).error)
      .not.toBeNull();
    const c2 = anon();
    expect((await c2.auth.signInWithPassword({ email: "fn_me_new@students.bilimtest.local", password: "Kid-pass-123" })).error)
      .toBeNull();
    expect((await c2.from("profiles").select("nickname").single()).data).toEqual({ nickname: "fn_me_new" });
    expect((await c2.rpc("my_grade")).data).toBe(9);
  }, 60_000);
});

afterAll(async () => {
  await sql?.end();
});
