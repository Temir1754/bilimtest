import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApp } from "../src/admin/AdminApp";
import type {
  AdminApi, Me, QuestionItem, RegionRow, SchoolRow, SectionRow, SignupSettings, SubjectRow, TopicRow, UserRow,
  Assignment, ClassReport, ClassRow,
} from "../src/admin/api";
import { fromRow, readyIn, type QuestionRow, type toPayload } from "../src/admin/form";
import { headers } from "../src/admin/excel";
import { ADMIN } from "../src/i18n/admin";

/** Строка шаблона: тема, вопрос, правильный и неверные ответы — одинаково на трёх языках. */
const row = (topic: string, q: string, ...answers: string[]) =>
  [topic, q, q, q, ...[0, 1, 2, 3].flatMap((i) => [answers[i] ?? "", answers[i] ?? "", answers[i] ?? ""]), "", "", "", "2"];

// Заглушка базы в памяти: проверяем экраны админки без Supabase.
function fakeApi(me: Me | null) {
  const subjects: SubjectRow[] = [
    { id: "s1", slug: "math", icon: "π", name_kk: "Математика", name_ru: "Математика", name_en: "Math", only_lang: null, sort_order: 0 },
    { id: "s2", slug: "physics", icon: "⚛", name_kk: "Физика", name_ru: "Физика", name_en: "Physics", only_lang: null, sort_order: 1 },
  ];
  const sections: SectionRow[] = [
    { id: "sec1", subject_id: "s1", grade: 5, title_kk: "Сандар", title_ru: "Натуральные числа", title_en: "Numbers", sort_order: 0 },
    { id: "sec2", subject_id: "s1", grade: 5, title_kk: "Бөлшектер", title_ru: "Обыкновенные дроби", title_en: "Fractions", sort_order: 1 },
  ];
  const topics: TopicRow[] = [
    { id: "t1", subject_id: "s1", grade: 5, section_id: "sec2", title_kk: "Бөлшек", title_ru: "Дроби", title_en: "Fractions", sort_order: 1 },
    { id: "t2", subject_id: "s1", grade: 5, section_id: "sec1", title_kk: "Қосу", title_ru: "Сложение", title_en: "Addition", sort_order: 0 },
    { id: "t3", subject_id: "s1", grade: 5, section_id: null, title_kk: "Ескі", title_ru: "Старая тема", title_en: "Old", sort_order: 2 },
  ];
  const questions: QuestionRow[] = [{
    id: "q1", topic_id: "t1", text_kk: "2+2?", text_ru: "2+2?", text_en: "2+2?",
    explanation_kk: null, explanation_ru: null, explanation_en: null, image_url: null, difficulty: 2,
    status: "review", review_comment: null, author_id: "teacher", teacher_check: "Нет подходящей темы",
    options: ["4", "5", "6"].map((s, i) => ({ sort_order: i, is_correct: i === 0, text_kk: s, text_ru: s, text_en: s })),
  }, {
    // неполный черновик: два варианта — при массовой публикации пропускается
    id: "q2", topic_id: "t1", text_kk: "Неполный", text_ru: "Неполный", text_en: "Incomplete",
    explanation_kk: null, explanation_ru: null, explanation_en: null, image_url: null, difficulty: 2,
    status: "draft", review_comment: null, author_id: "teacher",
    options: ["1", "2"].map((s, i) => ({ sort_order: i, is_correct: i === 0, text_kk: s, text_ru: s, text_en: s })),
  }];
  const regions: RegionRow[] = [
    { id: "r1", parent_id: null, name_kk: "Астана", name_ru: "Астана", sort_order: 1 },
    { id: "r2", parent_id: null, name_kk: "Абай облысы", name_ru: "Абайская область", sort_order: 10 },
  ];
  const schools: SchoolRow[] = [];
  const person = (id: string, email: string, role: UserRow["role"], extra: Partial<UserRow> = {}): UserRow => ({
    id, email, role, nickname: null, first_name: "", last_name: "", school_id: null, school_region: null, school_kk: null,
    school_ru: null, school_other: null, grade: null, subjects: null, grades: null, trusted: false, q_total: 0, q_review: 0, q_published: 0, blocked_at: null, must_change_password: false, created_at: "2026-10-27T10:00:00Z", last_sign_in_at: null, ...extra,
  });
  const users: UserRow[] = [
    person("admin", "a@x.kz", "admin"),
    person("kid", "kid07@students.bilimtest.local", "student", { nickname: "kid07", grade: 6 }),
  ];
  let settings: SignupSettings = { teacher: false, student: false, teacher_drafts_per_day: 50, teacher_imports_per_day: 300, student_signups_per_hour: 60, topic_min_questions: 5, mail: false };
  let user = me;
  let scope: { subjects: string[]; grades: number[] } | null = null;
  const saved: ReturnType<typeof toPayload>[] = [];
  const classes: ClassRow[] = [];
  const tasks: Assignment[] = [];
  const report: Omit<ClassReport, "class"> = {
    students: [{ id: "st1", display_name: "Айдос К.", nickname: "aidos07", runs: 3, percent: 45, last_at: "2026-10-27T10:00:00Z" }],
    topics: [{ topic_id: "t1", grade: 5, title_kk: "Бөлшек", title_ru: "Дроби", title_en: "Fractions", answers: 20, students: 1, percent: 45 }],
  };
  const api: AdminApi = {
    async me() { return user; },
    onAuthChange: () => () => {},
    async signOut() { user = null; },
    setPassword: vi.fn(async (pw: string) => {
      if (pw.length < 6) throw new Error("Password should be at least 6 characters.");
      if (user) user = { ...user, mustChangePassword: false };
    }),
    async subjects() { return subjects; },
    async gradeSubjects(g) { return [...new Set([...sections, ...topics].filter((x) => x.grade === g).map((x) => x.subject_id))]; },
    async saveSubject() {},
    async deleteSubject() {},
    async sections(s, g) { return sections.filter((x) => x.subject_id === s && x.grade === g); },
    saveSection: vi.fn(async ({ id, ...x }: Omit<SectionRow, "id"> & { id?: string }) => {
      const old = sections.find((r) => r.id === id);
      if (old) Object.assign(old, x); else sections.push({ ...x, id: `sec${sections.length + 1}` });
    }),
    deleteSection: vi.fn(async (id: string) => {
      sections.splice(sections.findIndex((r) => r.id === id), 1);
      for (const t of topics) if (t.section_id === id) t.section_id = null;
    }),
    async topics(s, g) { return topics.filter((t) => t.subject_id === s && t.grade === g).map((t) => ({ ...t })); },
    async topic(id) { return topics.find((t) => t.id === id)!; },
    async counts() { return { t1: { draft: 0, review: 1, published: 0 } }; },
    async topicCounts(g, lang) {
      return topics.filter((t) => t.grade === g).map((t) => ({ topic_id: t.id, subject_id: t.subject_id,
        ready: questions.filter((q) => q.topic_id === t.id && q.status === "published" && readyIn(fromRow(q), lang)).length }));
    },
    async topicMin() { return settings.topic_min_questions; },
    async authorProgress() { return { published: 52, next: 100, can_issue: 50, issued: [] }; },
    issueCertificate: vi.fn(async () => "cert-1"),
    async classes() { return classes.map((c) => ({ ...c, students: report.students.length })); },
    createClass: vi.fn(async (subjectId: string, grade: number, letter: string) => {
      classes.push({ id: "c1", subject_id: subjectId, grade, letter: letter.toUpperCase(), join_code: "ABC234" });
      return { id: "c1", join_code: "ABC234" };
    }),
    deleteClass: vi.fn(async () => { classes.length = 0; }),
    async assignments() { return tasks.slice(); },
    createAssignment: vi.fn(async (_c: string, topicId: string, due: string) => {
      tasks.unshift({ id: "a1", topic_id: topicId, grade: 5, title_kk: "Бөлшек", title_ru: "Дроби", title_en: "Fractions",
        due_at: due + "T18:59:59Z", created_at: "", students: [{ id: "st1", name: "Айдос К.", percent: 80, done_at: "" }] });
      return "a1";
    }),
    deleteAssignment: vi.fn(async () => { tasks.length = 0; }),
    async classMatrix() {
      return { min_answers: 5, students: report.students.map((x) => ({ id: x.id, name: x.display_name, last_at: x.last_at, inactive: true })),
        topics: [{ id: "t1", grade: 5, title_kk: "Бөлшек", title_ru: "Дроби", title_en: "Fractions" },
          { id: "t9", grade: 4, title_kk: "Қосу", title_ru: "Сложение", title_en: "Addition" }],
        cells: [{ s: "st1", t: "t1", n: 20, pct: 85 }, { s: "st1", t: "t9", n: 3, pct: 100 }] };
    },
    async studentReport() {
      return { name: "Айдос К.", runs: 3, percent: 45, weeks: [{ week: "2026-10-26", tests: 3, percent: 45 }],
        topics: [{ id: "t1", grade: 5, title_kk: "Бөлшек", title_ru: "Дроби", title_en: "Fractions", n: 12, pct: 40 }],
        wrong: [{ id: "q9", text_kk: "1/2 + 1/4 = ?", text_ru: "1/2 + 1/4 = ?", text_en: "1/2 + 1/4 = ?", times: 3 }] };
    },
    async classReport(id: string) { return { ...report, class: classes.find((c) => c.id === id)! }; },
    removeMember: vi.fn(async (_c: string, sid: string) => { report.students = report.students.filter((x) => x.id !== sid); }),
    teacherScope: vi.fn(async () => scope),
    saveTopic: vi.fn(async ({ id, ...x }: Omit<TopicRow, "id"> & { id?: string }) => {
      const old = topics.find((r) => r.id === id);
      if (old) Object.assign(old, x); else topics.push({ ...x, id: `t${topics.length + 1}` });
    }),
    async deleteTopic() {},
    async authorCounts(id: string) {
      const mine = questions.filter((q) => q.author_id === id);
      return { draft: 0, review: 0, published: 0, ...Object.fromEntries((["draft", "review", "published"] as const)
        .map((st) => [st, mine.filter((q) => q.status === st).length])) };
    },
    async questions(f) {
      return questions.filter((q) => (!f.topicId || q.topic_id === f.topicId) && (!f.status || q.status === f.status) &&
        (!f.authorId || q.author_id === f.authorId) && (!f.needsTranslation || !q.text_ru || !q.text_en) &&
        (!f.teacherCheck || q.teacher_check) &&
        (!f.sectionId || topics.find((t) => t.id === q.topic_id)?.section_id === f.sectionId))
        .map((q) => ({ ...q, updated_at: "", topics: topics[0] })) as QuestionItem[];
    },
    async question(id) { return questions.find((q) => q.id === id)!; },
    saveQuestion: vi.fn(async (p: ReturnType<typeof toPayload>) => {
      saved.push(p);
      let q = questions.find((x) => x.id === p.p_id);
      if (!q) {
        q = { id: `q${questions.length + 1}`, author_id: user?.id ?? null, review_comment: null, image_url: null, difficulty: 2,
          explanation_kk: null, explanation_ru: null, explanation_en: null, text_kk: null, text_ru: null, text_en: null,
          topic_id: "", status: "draft", options: [] };
        questions.push(q);
      }
      Object.assign(q, p.p_q, { options: p.p_options.map((o, i) => ({ ...o, sort_order: i })) });
      return q.id;
    }),
    deleteQuestion: vi.fn(async (id: string) => { questions.splice(questions.findIndex((q) => q.id === id), 1); }),
    clearTeacherCheck: vi.fn(async (id: string) => { questions.find((q) => q.id === id)!.teacher_check = null; }),
    async exportChecks() {
      return questions.filter((q) => q.teacher_check).map((q) => ({ grade: 5, subject: subjects[0], topic: "Дроби", q }));
    },
    async uploadImage() { return "https://img/x.png"; },
    async regions() { return regions.map((r) => ({ ...r })); },
    saveRegion: vi.fn(async ({ id, ...r }: Omit<RegionRow, "id"> & { id?: string }) => {
      const old = regions.find((x) => x.id === id);
      if (old) Object.assign(old, r); else regions.push({ ...r, id: `r${regions.length + 1}` });
    }),
    async deleteRegion(id) { regions.splice(regions.findIndex((x) => x.id === id), 1); },
    async schools(regionId) { return schools.filter((x) => x.region_id === regionId).map((x) => ({ ...x })); },
    saveSchool: vi.fn(async ({ id, ...x }: Omit<SchoolRow, "id"> & { id?: string }) => {
      const old = schools.find((r) => r.id === id);
      if (old) Object.assign(old, x); else schools.push({ ...x, id: `sc${schools.length + 1}` });
    }),
    async deleteSchool(id) { schools.splice(schools.findIndex((x) => x.id === id), 1); },
    async users(f) {
      return users.filter((x) => (!f.role || x.role === f.role) && (!f.blocked || x.blocked_at) &&
        (!f.search || `${x.email} ${x.nickname}`.includes(f.search))).map((x) => ({ ...x }));
    },
    async userStats() {
      const n = (f: (x: UserRow) => boolean) => users.filter(f).length;
      return { teachers: n((x) => x.role === "teacher"), teachers_week: 0, students: n((x) => x.role === "student"), students_week: 1,
        review: questions.filter((q) => q.status === "review").length, blocked: n((x) => Boolean(x.blocked_at)), schools: [] };
    },
    updateUser: vi.fn(async (id: string, d: Parameters<AdminApi["updateUser"]>[1]) => {
      Object.assign(users.find((x) => x.id === id)!, { first_name: d.first_name, last_name: d.last_name, grade: d.grade ?? null });
    }),
    setRole: vi.fn(async (id: string, role: UserRow["role"]) => { users.find((x) => x.id === id)!.role = role; }),
    setBlocked: vi.fn(async (id: string, b: boolean) => { users.find((x) => x.id === id)!.blocked_at = b ? "now" : null; }),
    setTrusted: vi.fn(async (id: string, v: boolean) => { users.find((x) => x.id === id)!.trusted = v; }),
    createTeacher: vi.fn(async (email: string, data: Parameters<AdminApi["createTeacher"]>[1]) => {
      users.unshift(person("t9", email, "teacher", { nickname: data.nickname, must_change_password: true }));
      return { id: "t9", password: "tempabc234" };
    }),
    resetUserPassword: vi.fn(async (id: string) => {
      users.find((x) => x.id === id)!.must_change_password = true;
      return { password: "newpass789" };
    }),
    async settings() { return { ...settings }; },
    saveSettings: vi.fn(async (s: SignupSettings) => { settings = s; }),
    importQuestions: vi.fn(async (_s: string, _g: number, rows: unknown[]) => ({ questions: rows.length, topics: 1, published: 0 })),
    async exportQuestions() { return questions.map((q) => ({ topic: "Дроби", q })); },
    publish: vi.fn(async (ids: string[]) => {
      for (const q of questions) if (ids.includes(q.id)) q.status = "published";
      return ids.length;
    }),
  };
  return { api, saved, sections, topics, questions, regions, schools, users, person, getSettings: () => settings,
    setScope: (x: typeof scope) => { scope = x; } };
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  localStorage.setItem("bt-prefs", JSON.stringify({ lang: "ru", grade: 5 }));
  sessionStorage.setItem("bt-admin", JSON.stringify({ grade: 5, subjectId: "s1", topicId: "t1" }));
  history.replaceState(null, "", "/admin/questions/search");
});
afterEach(cleanup);

describe("админка", () => {
  it("не вошёл — переход на общую страницу входа /login", async () => {
    const go = vi.fn();
    render(<AdminApp api={fakeApi(null).api} go={go} />);
    await waitFor(() => expect(go).toHaveBeenCalledWith("/login"));
  });

  it("временный пароль: новый пароль, потом админка", async () => {
    const user = userEvent.setup();
    const { api } = fakeApi({ id: "admin", email: "a@x.kz", role: "admin", mustChangePassword: true });
    render(<AdminApp api={api} />);
    await user.type(await screen.findByLabelText("Новый пароль"), "123");
    await user.type(screen.getByLabelText("Повторите пароль"), "124");
    await user.click(screen.getByRole("button", { name: "Сохранить пароль" }));
    expect(await screen.findByText("Пароли не совпадают.")).toBeTruthy();
    expect(api.setPassword).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Новый пароль"));
    await user.clear(screen.getByLabelText("Повторите пароль"));
    await user.type(screen.getByLabelText("Новый пароль"), "newsecret");
    await user.type(screen.getByLabelText("Повторите пароль"), "newsecret");
    await user.click(screen.getByRole("button", { name: "Сохранить пароль" }));
    expect(api.setPassword).toHaveBeenCalledWith("newsecret");
    await user.click(await screen.findByRole("button", { name: "Перейти в админку" }));
    expect(await screen.findByRole("button", { name: /2\+2\?/ })).toBeTruthy();
  });

  it("шапка как на сайте: ник с меню «На сайт / Кабинет / Выйти», email не виден", async () => {
    const user = userEvent.setup();
    const { api } = fakeApi({ id: "admin", email: "a@x.kz", role: "admin", nickname: "temir" });
    const go = vi.fn();
    render(<AdminApp api={api} go={go} />);
    await user.click(await screen.findByRole("button", { name: "Меню аккаунта" }));
    expect(screen.getByText("temir")).toBeTruthy();
    expect(screen.queryByText(/a@x.kz/)).toBeNull();
    expect(screen.getByRole("menuitem", { name: "На сайт" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("menuitem", { name: "Кабинет" }).getAttribute("href")).toBe("/admin");
    await user.click(screen.getByRole("menuitem", { name: "Выйти" }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("/login"));
  });

  it("ученику админка недоступна", async () => {
    render(<AdminApp api={fakeApi({ id: "s", email: "kid@x.kz", role: "student" }).api} />);
    expect(await screen.findByText(/нет доступа к админке/)).toBeTruthy();
  });

  it("учитель не видит «Опубликовать» и раздел «На проверке»", async () => {
    const user = userEvent.setup();
    render(<AdminApp api={fakeApi({ id: "teacher", email: "t@x.kz", role: "teacher" }).api} />);
    await user.click(await screen.findByRole("button", { name: /2\+2\?/ }));
    await screen.findByRole("button", { name: "Сохранить" });
    expect(screen.queryByRole("button", { name: "Опубликовать" })).toBeNull();
    expect(screen.queryByRole("link", { name: "На проверке" })).toBeNull();
    expect(screen.getByRole("link", { name: "Мои вопросы" })).toBeTruthy();
  });

  it("админ публикует вопрос из очереди проверки, сменив правильный ответ", async () => {
    const user = userEvent.setup();
    const { api, saved } = fakeApi({ id: "admin", email: "a@x.kz", role: "admin" });
    render(<AdminApp api={api} />);
    await user.click(await screen.findByRole("link", { name: "На проверке" }));
    await user.click(await screen.findByRole("link", { name: /2\+2\?/ }));
    await user.click(await screen.findByLabelText("Вариант B правильный"));
    await user.click(screen.getByRole("button", { name: "Сохранить" })); // админ публикует сразу (№87)
    expect(await screen.findByText("Опубликовано.")).toBeTruthy();
    expect(saved[0].p_q.status).toBe("published");
    expect(saved[0].p_options.map((o) => o.is_correct)).toEqual([false, true, false]);
  });

  it("неполный вопрос не отправляется в базу при публикации", async () => {
    const user = userEvent.setup();
    const { api } = fakeApi({ id: "admin", email: "a@x.kz", role: "admin" });
    render(<AdminApp api={api} />);
    await user.click(await screen.findByRole("button", { name: /2\+2\?/ }));
    for (const [l, tab] of [["KK", "Казахский"], ["RU", "Русский"], ["EN", "Английский"]]) {
      await user.click(await screen.findByRole("tab", { name: new RegExp(tab) }));
      await user.clear(screen.getByLabelText(`Вариант C (${l})`));
    }
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Нужно 3 или 4 варианта ответа, сейчас 2.")).toBeTruthy();
    expect(api.saveQuestion).not.toHaveBeenCalled();
  });

  it("вернуть на доработку можно только с комментарием", async () => {
    const user = userEvent.setup();
    const { api, saved } = fakeApi({ id: "admin", email: "a@x.kz", role: "admin" });
    render(<AdminApp api={api} />);
    await user.click(await screen.findByRole("button", { name: /2\+2\?/ }));
    const back = await screen.findByRole("button", { name: "Вернуть на доработку" });
    expect((back as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText(/Комментарий для учителя/), "Добавьте пояснение");
    await user.click(back);
    expect(await screen.findByText("Вопрос возвращён учителю на доработку.")).toBeTruthy();
    expect(saved[0].p_q).toMatchObject({ status: "draft", review_comment: "Добавьте пояснение" });
  });

  it("загрузка из Excel: показывает ошибки строк и загружает только правильные", async () => {
    const user = userEvent.setup();
    const { api } = fakeApi({ id: "teacher", email: "t@x.kz", role: "teacher" });
    render(<AdminApp api={api} />);
    await user.click(await screen.findByRole("button", { name: "Загрузить из файла (Excel, Word)" }));

    const sheet = [headers(ADMIN.ru),
      row("Дроби", "Сколько будет 1/2 + 1/2?", "1", "2", "1/4"),
      row("Новая тема", "Без неверных ответов", "1", "", ""),
    ];
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet), "Вопросы");
    const file = new File([XLSX.write(wb, { type: "array", bookType: "xlsx" })], "q.xlsx");
    await user.upload(await screen.findByLabelText(/Выберите заполненный файл/), file);

    expect(await screen.findByText(/Ошибка: нужно минимум 2 неверных ответа/)).toBeTruthy();
    expect(screen.queryByText(/Будут созданы новые темы/)).toBeNull(); // «Новая тема» с ошибкой не создаётся
    await user.click(screen.getByRole("checkbox", { name: /право их публиковать/ })); // «я автор» (№103)
    await user.click(screen.getByRole("button", { name: "Загрузить 1 в черновики" }));
    expect(await screen.findByText(/загружено вопросов — 1/)).toBeTruthy();
    const rows = (api.importQuestions as ReturnType<typeof vi.fn>).mock.calls[0][2] as { topic: string }[];
    expect(rows.map((r) => r.topic)).toEqual(["Дроби"]);
  });

  it("загрузка из Word (№91): класс и предмет наверху, тема программы по названию, правка в таблице", async () => {
    const user = userEvent.setup();
    history.replaceState(null, "", "/admin/questions/math/5/excel");
    const { api } = fakeApi({ id: "teacher", email: "t@x.kz", role: "teacher" });
    render(<AdminApp api={api} />);
    expect(await screen.findByText("5 класс · π Математика")).toBeTruthy();

    const para = (t: string, b = false) => `<w:p><w:r>${b ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t>${t}</w:t></w:r></w:p>`;
    const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${[
      para("§1. Дроби"), para("1. Сколько будет 1/2 + 1/2?", true), para("1"), para("2"), para("1/4"),
      para("2. Сколько будет 2 + 2?", true), para("3"), para("4"), para("5"), para("6"), para("7"),
      para("§2. Ежелгі өлшемдер"), para("1. Сколько шагов в сажени?", true), para("2"), para("3"), para("4"), para("$1 1A 2В"), para("$2 1A"),
    ].join("")}</w:body></w:document>`;
    const { zipSync, strToU8 } = await import("fflate");
    const file = new File([new Uint8Array(zipSync({ "word/document.xml": new Uint8Array(strToU8(xml)) }))], "test.docx");
    await user.upload(screen.getByLabelText(/Или выберите файл Word/), file);

    const topic = await screen.findByRole("combobox", { name: "Тема программы: §1. Дроби" });
    expect((topic as HTMLSelectElement).value).toBe("t1"); // подобрана по названию
    expect(screen.getByText(/5 вариантов — уберите один/)).toBeTruthy();
    // темы «Ежелгі өлшемдер» в программе нет — по умолчанию новая тема с названием из файла (№92)
    const fresh = screen.getByRole("combobox", { name: "Тема программы: §2. Ежелгі өлшемдер" }) as HTMLSelectElement;
    expect(fresh.value).toBe("new");
    expect(within(fresh).getByRole("option", { name: "+ Новая тема: «Ежелгі өлшемдер»" })).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Раздел для всех новых тем"), "Натуральные числа");
    expect(screen.getByRole("button", { name: "Загрузить 2 в черновики" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Вопрос §1 · 2: удалить вариант 5" }));
    await user.click(screen.getByRole("checkbox", { name: /право их публиковать/ })); // «я автор» (№103)
    await user.click(screen.getByRole("button", { name: "Загрузить 3 в черновики" }));
    expect(await screen.findByText(/загружено вопросов — 3/)).toBeTruthy();
    const [subject, grade, rows] = (api.importQuestions as ReturnType<typeof vi.fn>).mock.calls[0];
    expect([subject, grade]).toEqual(["s1", 5]);
    expect(rows[1]).toEqual({ topic_id: "t1", difficulty: 2, text_ru: "Сколько будет 2 + 2?", explanation_ru: "",
      options: [{ text_ru: "3", is_correct: false }, { text_ru: "4", is_correct: true }, { text_ru: "5", is_correct: false },
        { text_ru: "6", is_correct: false }] });
    expect(rows[2]).toMatchObject({ topic: "Ежелгі өлшемдер", section_id: "sec1", text_ru: "Сколько шагов в сажени?" });
  });

  it("Excel со своими столбцами: окно «какой столбец что значит», затем та же таблица", async () => {
    const user = userEvent.setup();
    history.replaceState(null, "", "/admin/questions/math/5/excel");
    const { api } = fakeApi({ id: "admin", email: "a@x.kz", role: "admin" });
    render(<AdminApp api={api} />);
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["№", "Вопрос", "A", "B", "C", "Ответ"], [1, "2+2?", "3", "4", "5", "B"]]), "Лист1");
    await user.upload(await screen.findByLabelText(/Выберите заполненный файл/),
      new File([XLSX.write(wb, { type: "array", bookType: "xlsx" })], "свой.xlsx"));
    const box = await screen.findByRole("group", { name: "Какой столбец что значит?" });
    await user.click(within(box).getByRole("button", { name: "Дальше" }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Тема программы: Без темы" }), "Сложение");
    await user.click(screen.getByRole("checkbox", { name: /право их публиковать/ })); // «я автор» (№103)
    await user.click(screen.getByRole("button", { name: "Загрузить 1 и опубликовать" })); // админ: сразу публикует (№94)
    await vi.waitFor(() => expect(api.importQuestions).toHaveBeenCalled());
    expect((api.importQuestions as ReturnType<typeof vi.fn>).mock.calls[0][3]).toBe(true);
    const rows = (api.importQuestions as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(rows[0]).toMatchObject({ topic_id: "t2", text_ru: "2+2?",
      options: [{ text_ru: "3", is_correct: false }, { text_ru: "4", is_correct: true }, { text_ru: "5", is_correct: false }] });
  });

  it("«Опубликовать готовые черновики»: спрашивает подтверждение и публикует только вопросы без ошибок", async () => {
    const user = userEvent.setup();
    const { api } = fakeApi({ id: "admin", email: "a@x.kz", role: "admin" });
    const ask = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminApp api={api} />);
    await user.click(await screen.findByRole("button", { name: "Опубликовать готовые черновики" }));
    expect(ask).toHaveBeenCalledWith("Будет опубликовано вопросов: 1, пропущено из-за ошибок: 1. Продолжить?");
    expect(api.publish).toHaveBeenCalledWith(["q1"]);
    expect(await screen.findByText(/Опубликовано: 1\. Пропущено: 1/)).toBeTruthy();
    ask.mockRestore();
  });

  it("без выбранной темы — «Опубликовать все готовые черновики предмета» за одно нажатие", async () => {
    sessionStorage.setItem("bt-admin", JSON.stringify({ grade: 5, subjectId: "s1", topicId: null }));
    const user = userEvent.setup();
    const { api } = fakeApi({ id: "admin", email: "a@x.kz", role: "admin" });
    const load = vi.spyOn(api, "exportQuestions");
    const ask = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminApp api={api} />);
    await user.click(await screen.findByRole("button", { name: "Опубликовать все готовые черновики предмета" }));
    expect(load).toHaveBeenCalledWith("s1", 5, undefined);
    expect(api.publish).toHaveBeenCalledWith(["q1"]);
    ask.mockRestore();
  });

  it("шаг 2 «Тақырып»: у админа кнопка «Опубликовать все готовые черновики предмета»", async () => {
    history.replaceState(null, "", "/admin/questions/math/5");
    const user = userEvent.setup();
    const { api } = fakeApi({ id: "admin", email: "a@x.kz", role: "admin" });
    const ask = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminApp api={api} />);
    await user.click(await screen.findByRole("button", { name: "Опубликовать все готовые черновики предмета" }));
    await vi.waitFor(() => expect(api.publish).toHaveBeenCalledWith(["q1"]));
    expect(await screen.findByText(/Опубликовано: 1/)).toBeTruthy();
    ask.mockRestore();
  });

  it("учитель не видит массовую публикацию", async () => {
    render(<AdminApp api={fakeApi({ id: "teacher", email: "t@x.kz", role: "teacher" }).api} />);
    await screen.findByRole("button", { name: /2\+2\?/ });
    expect(screen.queryByRole("button", { name: "Опубликовать готовые черновики" })).toBeNull();
  });

  it("доверенный учитель (№94): массовая публикация своих вопросов; в загрузке — «сразу опубликовать»", async () => {
    const user = userEvent.setup();
    const { api } = fakeApi({ id: "teacher", email: "t@x.kz", role: "teacher", trusted: true });
    const ask = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminApp api={api} />);
    await user.click(await screen.findByRole("button", { name: "Опубликовать готовые черновики" }));
    await vi.waitFor(() => expect(api.publish).toHaveBeenCalled());
    ask.mockRestore();

    cleanup();
    history.replaceState(null, "", "/admin/questions/math/5/excel");
    render(<AdminApp api={api} />);
    expect((await screen.findByRole("checkbox", { name: /Сразу опубликовать вопросы без ошибок/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("обычному учителю загрузка — только в черновики, без галочки «опубликовать»", async () => {
    history.replaceState(null, "", "/admin/questions/math/5/excel");
    render(<AdminApp api={fakeApi({ id: "teacher", email: "t@x.kz", role: "teacher" }).api} />);
    expect(await screen.findByText(/Все вопросы попадут в черновики/)).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /Сразу опубликовать/ })).toBeNull();
  });

  it("язык админки переключается и запоминается вместе с языком сайта", async () => {
    const user = userEvent.setup();
    render(<AdminApp api={fakeApi({ id: "admin", email: "a@x.kz", role: "admin" }).api} />);
    await user.click(await screen.findByRole("button", { name: "KK" }));
    expect(screen.getByRole("button", { name: "Файлдан жүктеу (Excel, Word)" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Тексеруде" })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("bt-prefs")!).lang).toBe("kk");
    await user.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByRole("button", { name: "Import from a file (Excel, Word)" })).toBeTruthy();
  });

  it("предпросмотр показывает вопрос глазами ученика", async () => {
    const user = userEvent.setup();
    render(<AdminApp api={fakeApi({ id: "admin", email: "a@x.kz", role: "admin" }).api} />);
    await user.click(await screen.findByRole("button", { name: /2\+2\?/ }));
    await user.click(await screen.findByRole("button", { name: /Предпросмотр/ }));
    const opts = screen.getAllByRole("button").filter((b) => b.classList.contains("opt"));
    expect(opts.map((b) => b.textContent)).toEqual(["A4", "B5", "C6"]);
    await user.click(opts[1]);
    expect(await screen.findByText(/Қате/)).toBeTruthy();
  });

  it("фильтр «Требует проверки учителем»: показывает помеченные вопросы; админ снимает пометку", async () => {
    const user = userEvent.setup();
    const { api } = fakeApi({ id: "admin", email: "a@x.kz", role: "admin" });
    render(<AdminApp api={api} />);
    await user.click(await screen.findByLabelText("Требует проверки учителем"));
    expect(await screen.findByRole("heading", { name: "Требует проверки учителем" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Неполный/ })).toBeNull();
    await user.click(await screen.findByRole("button", { name: /2\+2\?/ }));
    expect(await screen.findByText("Нет подходящей темы")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Проверено — снять пометку" }));
    expect(api.clearTeacherCheck).toHaveBeenCalledWith("q1");
    expect(screen.queryByText("Нет подходящей темы")).toBeNull();
  });

  it("разделы: темы сгруппированы, выбор раздела показывает его вопросы", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem("bt-admin", JSON.stringify({ grade: 5, subjectId: "s1" }));
    render(<AdminApp api={fakeApi({ id: "admin", email: "a@x.kz", role: "admin" }).api} />);
    expect(await screen.findByText("Без раздела")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Натуральные числа/ }));
    expect(await screen.findByRole("heading", { name: "Натуральные числа" })).toBeTruthy();
    expect(await screen.findByText("Вопросов не найдено.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Обыкновенные дроби/ }));
    expect(await screen.findByRole("button", { name: /2\+2\?/ })).toBeTruthy();
  });

  it("разделы: создать, поднять выше; тема переходит в другой раздел и встаёт в его конец", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem("bt-admin", JSON.stringify({ grade: 5, subjectId: "s1" }));
    const { api, sections, topics } = fakeApi({ id: "teacher", email: "t@x.kz", role: "teacher" });
    render(<AdminApp api={api} />);

    await user.click(await screen.findByRole("button", { name: "+ раздел" }));
    await user.type(screen.getByLabelText("Название RU"), "Геометрия");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByRole("button", { name: /Геометрия/ })).toBeTruthy();
    expect(sections.find((x) => x.title_ru === "Геометрия")).toMatchObject({ sort_order: 2, grade: 5 });

    await user.click(screen.getByRole("button", { name: /Обыкновенные дроби/ }));
    await user.click(screen.getByRole("button", { name: "Раздел выше" }));
    await vi.waitFor(() => expect(sections.map((x) => [x.id, x.sort_order])).toEqual([["sec1", 1], ["sec2", 0], ["sec3", 2]]));
    // темы идут за разделами: «Дроби» теперь первая
    expect(topics.map((x) => [x.id, x.sort_order])).toEqual([["t1", 0], ["t2", 1], ["t3", 2]]);
    expect(screen.queryByRole("button", { name: "удалить" })).toBeNull(); // учитель разделы не удаляет

    await user.click(screen.getByRole("button", { name: /Старая тема/ }));
    await user.click(screen.getByRole("button", { name: "переименовать" }));
    await user.selectOptions(screen.getByLabelText("Раздел"), "Натуральные числа");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await vi.waitFor(() => expect(topics.find((x) => x.id === "t3")).toMatchObject({ section_id: "sec1", sort_order: 2 }));
    expect(topics.map((x) => [x.id, x.sort_order])).toEqual([["t1", 0], ["t2", 1], ["t3", 2]]);
  });

  it("админ удаляет раздел: темы остаются без раздела", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem("bt-admin", JSON.stringify({ grade: 5, subjectId: "s1", sectionId: "sec1" }));
    const { api, topics } = fakeApi({ id: "admin", email: "a@x.kz", role: "admin" });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminApp api={api} />);
    const sec = (await screen.findByRole("button", { name: /Натуральные числа/ })).closest("li")!;
    await user.click(within(sec).getAllByRole("button", { name: "удалить" })[0]);
    expect(api.deleteSection).toHaveBeenCalledWith("sec1");
    await vi.waitFor(() => expect(screen.queryByRole("button", { name: /Натуральные числа/ })).toBeNull());
    expect(topics.find((x) => x.id === "t2")!.section_id).toBeNull();
    expect(screen.getByText("Сложение")).toBeTruthy();
  });

  it("в списке предметов — только предметы класса; «Показать все предметы» открывает остальные", async () => {
    const user = userEvent.setup();
    render(<AdminApp api={fakeApi({ id: "admin", email: "a@x.kz", role: "admin" }).api} />);
    const list = await screen.findByLabelText("Предмет");
    // сначала дождаться загрузки предметов, иначе пустой список «проходит» проверку на отсутствие физики
    await within(list).findByRole("option", { name: /Математика/ });
    await vi.waitFor(() => expect(within(list).queryByRole("option", { name: /Физика/ })).toBeNull());
    await user.click(screen.getByRole("button", { name: "Показать все предметы" }));
    expect(within(list).getByRole("option", { name: /Физика/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Только предметы 5 класса" }));
    expect(within(list).queryByRole("option", { name: /Физика/ })).toBeNull();
  });

  it("«Школы» (админ): район в области, школа в районе; учитель экрана не видит", async () => {
    const user = userEvent.setup();
    const { api, regions, schools } = fakeApi({ id: "admin", email: "a@x.kz", role: "admin" });
    render(<AdminApp api={api} />);
    await user.click(await screen.findByRole("link", { name: "Школы" }));
    await user.selectOptions(await screen.findByLabelText("Область / город"), "Абайская область");
    await user.click(screen.getByRole("button", { name: "+ район / город" }));
    await user.type(screen.getByLabelText("Название RU"), "Семей");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText("Напишите название и на казахском, и на русском.")).toBeTruthy();
    await user.type(screen.getByLabelText("Название KK"), "Семей");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await user.click(await screen.findByRole("button", { name: "Семей" }));
    expect(regions.find((r) => r.name_ru === "Семей")).toMatchObject({ parent_id: "r2" });

    await user.click(screen.getByRole("button", { name: "+ Школа" }));
    await user.type(screen.getByLabelText("Название RU"), "Школа-лицей №1");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText("Школа-лицей №1")).toBeTruthy();
    expect(schools[0]).toMatchObject({ region_id: "r3", approved: true, name_kk: "" });
  });

  it("шаг 2 (№92): учитель добавляет тему и раздел, переименовывает; удалять — только админ", async () => {
    const user = userEvent.setup();
    history.replaceState(null, "", "/admin/questions/math/5");
    const { api, topics } = fakeApi({ id: "teacher", email: "t@x.kz", role: "teacher" });
    render(<AdminApp api={api} />);
    const sec = (await screen.findByRole("heading", { name: "Обыкновенные дроби" })).closest("section")!;
    await user.click(within(sec).getByRole("button", { name: "+ тема" }));
    await user.type(within(sec).getByLabelText("Название KK"), "Бөлшектерді салыстыру");
    await user.click(within(sec).getByRole("button", { name: "Сохранить" }));
    await vi.waitFor(() => expect(topics.find((x) => x.title_kk === "Бөлшектерді салыстыру")).toMatchObject({ section_id: "sec2" }));

    await user.click(screen.getByRole("button", { name: "+ раздел" }));
    await user.type(screen.getByLabelText("Название KK"), "Жаңа бөлім");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(api.saveSection).toHaveBeenCalledWith(expect.objectContaining({ title_kk: "Жаңа бөлім", subject_id: "s1", grade: 5 }));

    await user.click(screen.getByRole("button", { name: "«Дроби»: действия" }));
    expect(screen.getByRole("menuitem", { name: "переименовать" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "удалить" })).toBeNull();
  });

  it("учитель не видит экраны «Школы» и «Пользователи»", async () => {
    render(<AdminApp api={fakeApi({ id: "teacher", email: "t@x.kz", role: "teacher" }).api} />);
    await screen.findByRole("link", { name: "Вопросы" });
    expect(screen.queryByRole("link", { name: "Школы" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Пользователи" })).toBeNull();
    expect(within(screen.getByRole("banner")).getByText("учитель")).toBeTruthy(); // метка в шапке — по роли
    expect(within(screen.getByRole("banner")).queryByText("админка")).toBeNull();
  });

  it("«Пользователи»: создать учителя (предметы — по классам), временный пароль показан один раз", async () => {
    const user = userEvent.setup();
    const { api } = fakeApi({ id: "admin", email: "a@x.kz", role: "admin" });
    render(<AdminApp api={api} />);
    await user.click(await screen.findByRole("link", { name: "Пользователи" }));
    expect(await screen.findByText("kid07")).toBeTruthy();
    expect(screen.getByText("входит по нику")).toBeTruthy(); // технический адрес ученика не показываем

    await user.click(screen.getByRole("button", { name: "+ Создать учителя" }));
    await user.type(screen.getByLabelText("Имя"), "Болат");
    await user.type(screen.getByLabelText("Фамилия"), "Ахметов");
    await user.type(screen.getByLabelText(/^Ник/), "bolat_t");
    await user.type(screen.getByLabelText("Email"), "bolat@mail.kz");
    await user.selectOptions(screen.getByLabelText("Школа"), "Нет в списке — вписать вручную");
    await user.type(screen.getByLabelText("Название школы"), "Школа №7");
    expect(screen.getByText("Сначала выберите классы.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "5" }));
    await user.click(await screen.findByRole("button", { name: "Математика" }));
    expect(screen.queryByRole("button", { name: "Физика" })).toBeNull(); // физики в 5 классе нет
    await user.click(screen.getByRole("button", { name: "Создать учителя" }));

    expect(await screen.findByText("tempabc234")).toBeTruthy();
    expect(api.createTeacher).toHaveBeenCalledWith("bolat@mail.kz", {
      nickname: "bolat_t", first_name: "Болат", last_name: "Ахметов", school_id: null, school_other: "Школа №7",
      subjects: ["s1"], grades: [5] });
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.queryByText("tempabc234")).toBeNull();
    expect(await screen.findByText("bolat_t")).toBeTruthy();
  });

  it("учитель с временным паролем в админке сначала меняет пароль", async () => {
    const { api } = fakeApi({ id: "teacher", email: "t@x.kz", role: "teacher", mustChangePassword: true });
    render(<AdminApp api={api} />);
    expect(await screen.findByLabelText("Новый пароль")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /2\+2\?/ })).toBeNull();
  });

  it("«Пользователи»: плитки и вкладки, панель человека, вопросы учителя; пароль и блокировка; себя — нельзя", async () => {
    const user = userEvent.setup();
    const { api, users, person } = fakeApi({ id: "admin", email: "a@x.kz", role: "admin" });
    users.push(person("tch", "aigerim@mail.kz", "teacher", { nickname: "aigerim", first_name: "Айгерім", last_name: "Сейітова",
      grades: [5, 6, 7], subjects: ["s1"], q_total: 12, q_review: 3, q_published: 9 }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminApp api={api} />);
    await user.click(await screen.findByRole("link", { name: "Пользователи" }));
    expect(await screen.findByText("kid07")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Роль" })).toBeNull(); // выбора роли в списке больше нет
    expect(screen.getByText("5–7 · Математика")).toBeTruthy();

    // плитка «Учителя» = вкладка «Учителя»
    await user.click((await screen.findAllByRole("button", { name: /^1s*Учителя/ }))[0]);
    expect(screen.getByRole("button", { name: "Учителя" }).getAttribute("aria-pressed")).toBe("true");
    await vi.waitFor(() => expect(screen.queryByText("kid07")).toBeNull());

    await user.click(screen.getByText("Айгерім Сейітова"));
    const panel = screen.getByRole("complementary", { name: "Айгерім Сейітова" });
    expect(within(panel).getByText("12")).toBeTruthy();
    expect(within(panel).getByText("опубликовано")).toBeTruthy();
    await user.click(within(panel).getByRole("link", { name: "Посмотреть вопросы" }));
    expect(location.pathname).toBe("/admin/users/tch/questions");
    expect(await screen.findByRole("heading", { name: "Вопросы учителя" })).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "← Пользователи" }));

    await user.click(await screen.findByText("kid07"));
    const kid = screen.getByRole("complementary", { name: "kid07" });
    await user.click(within(kid).getByRole("button", { name: "Выдать временный пароль" }));
    expect(await screen.findByText("newpass789")).toBeTruthy();
    await user.click(within(kid).getByText("Опасные действия"));
    await user.click(within(kid).getByRole("button", { name: "Сменить роль…" }));
    await user.selectOptions(within(kid).getByLabelText("Новая роль"), "учитель");
    await user.click(within(kid).getByRole("button", { name: "Сменить" }));
    expect(api.setRole).toHaveBeenCalledWith("kid", "teacher");
    await user.click(within(kid).getByRole("button", { name: "Заблокировать…" }));
    await vi.waitFor(() => expect(users.find((x) => x.id === "kid")!.blocked_at).toBe("now"));

    await user.click(screen.getByText("(вы)"));
    const self = screen.getByRole("complementary", { name: "a" });
    expect(within(self).queryByText("Опасные действия")).toBeNull();
    expect(within(self).queryByRole("button", { name: "Выдать временный пароль" })).toBeNull();
  });

  it("«Пользователи»: админ делает учителя доверенным (№94) — с подтверждением, в списке пометка", async () => {
    const user = userEvent.setup();
    const { api, users, person } = fakeApi({ id: "admin", email: "a@x.kz", role: "admin" });
    users.push(person("tch", "aigerim@mail.kz", "teacher", { first_name: "Айгерім", last_name: "Сейітова", grades: [5], subjects: ["s1"] }));
    const ask = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminApp api={api} />);
    await user.click(await screen.findByRole("link", { name: "Пользователи" }));
    await user.click(await screen.findByText("Айгерім Сейітова"));
    const panel = screen.getByRole("complementary", { name: "Айгерім Сейітова" });
    await user.click(within(panel).getByRole("checkbox", { name: /Доверенный учитель/ }));
    expect(ask).toHaveBeenCalledWith(expect.stringMatching(/доверенным учителем/));
    expect(api.setTrusted).toHaveBeenCalledWith("tch", true);
    expect(await screen.findByText("доверенный")).toBeTruthy();
    ask.mockRestore();
  });

  it("«Пользователи»: настройки регистрации — в окне; без почты — полоса с «Выключить»; правка данных ученика", async () => {
    const user = userEvent.setup();
    const { api, getSettings } = fakeApi({ id: "admin", email: "a@x.kz", role: "admin" });
    render(<AdminApp api={api} />);
    await user.click(await screen.findByRole("link", { name: "Пользователи" }));
    await user.click(await screen.findByRole("button", { name: "⚙ Настройки регистрации" }));
    const dialog = screen.getByRole("dialog", { name: "Настройки регистрации" });
    await user.click(await within(dialog).findByRole("checkbox", { name: /Регистрация учеников/ }));
    await user.click(within(dialog).getByRole("checkbox", { name: /Самостоятельная регистрация учителей/ }));
    await user.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    expect(await within(dialog).findByText("Сохранено.")).toBeTruthy();
    expect(getSettings()).toMatchObject({ student: true, teacher: true, mail: false });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();

    expect(await screen.findByText("Самостоятельная регистрация учителей включена")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Выключить" }));
    await vi.waitFor(() => expect(getSettings().teacher).toBe(false));
    await vi.waitFor(() => expect(screen.queryByText("Самостоятельная регистрация учителей включена")).toBeNull());

    await user.click(screen.getByText("kid07"));
    await user.click(screen.getByRole("button", { name: "Изменить данные" }));
    const edit = screen.getByRole("dialog", { name: "kid07: данные" });
    await user.type(within(edit).getByLabelText("Имя"), "Әлия");
    await user.click(within(edit).getByRole("button", { name: "8" }));
    await user.click(within(edit).getByRole("button", { name: "Сохранить" }));
    expect(api.updateUser).toHaveBeenCalledWith("kid", { first_name: "Әлия", last_name: "", school_id: null, school_other: "", grade: 8 });
    expect(await screen.findByRole("complementary", { name: "Әлия" })).toBeTruthy();
  });

  it("3 шага: класс и предмет → тема → новый вопрос; «Назад» браузера возвращает на шаг", async () => {
    const user = userEvent.setup();
    history.replaceState(null, "", "/admin/questions");
    const { api, saved } = fakeApi({ id: "admin", email: "a@x.kz", role: "admin" });
    render(<AdminApp api={api} />);
    expect(await screen.findByRole("heading", { name: "В какой класс добавляем вопросы?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "5" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(await screen.findByRole("link", { name: /Математика/ }));
    expect(location.pathname).toBe("/admin/questions/math/5");
    expect(await screen.findByRole("heading", { name: "Выберите тему" })).toBeTruthy();
    expect(screen.getByText("В каждой теме нужно не меньше 5 вопросов.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Обыкновенные дроби" })).toBeTruthy(); // раздел
    const topic = screen.getByRole("link", { name: "Дроби" }).closest("li")!;
    expect(within(topic).getByText("0 / 5")).toBeTruthy(); // опубликованных пока нет
    await user.click(within(topic).getByRole("link", { name: "+ Добавить вопрос" }));
    expect(location.pathname).toBe("/admin/questions/topic/t1/new");

    expect(await screen.findByRole("heading", { name: "Новый вопрос" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Казахский/ }).getAttribute("aria-selected")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Сохранить и следующий вопрос" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Напишите вопрос.")).toBeTruthy();
    expect(within(alert).getByText("Отметьте правильный ответ.")).toBeTruthy();

    await user.type(screen.getByLabelText("Текст вопроса (KK)"), "3 + 4 = ?");
    for (const [i, v] of ["7", "6", "8"].entries()) await user.type(screen.getByLabelText(`Вариант ${"ABC"[i]} (KK)`), v);
    await user.click(screen.getByLabelText("Вариант A правильный"));
    expect(screen.getByText("верно")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Сохранить и следующий вопрос" }));
    expect(await screen.findByText("Сохранено. Пишите следующий вопрос.")).toBeTruthy();
    // только на казахском, 4-й ответ пустой — публикуется (№88), пустая строка не сохраняется
    expect(saved[0].p_q).toMatchObject({ status: "published", text_kk: "3 + 4 = ?", text_ru: null });
    expect(saved[0].p_options).toHaveLength(3);
    expect((screen.getByLabelText("Текст вопроса (KK)") as HTMLTextAreaElement).value).toBe(""); // форма пустая
    // счётчик — по языку админки (№88): админка на русском, вопрос только на казахском
    expect(await screen.findByText("В этой теме: 0 / 5")).toBeTruthy();

    history.back();
    expect(await screen.findByRole("heading", { name: "Выберите тему" })).toBeTruthy();
  });

  it("учитель: один класс и один предмет — сразу шаг 2; меню «⋯» без удаления; вопрос — черновик и «Отправить на проверку»", async () => {
    const user = userEvent.setup();
    history.replaceState(null, "", "/admin/questions");
    const { api, saved, setScope } = fakeApi({ id: "teacher", email: "t@x.kz", role: "teacher" });
    setScope({ subjects: ["s1"], grades: [5] });
    render(<AdminApp api={api} />);
    expect(await screen.findByRole("heading", { name: "Выберите тему" })).toBeTruthy();
    expect(location.pathname).toBe("/admin/questions/math/5");
    expect(screen.getAllByRole("button", { name: /действия/ }).length).toBeGreaterThan(0); // «⋯» есть, но без «удалить» (№92)
    expect(screen.getByRole("button", { name: "Файл ▾" })).toBeTruthy();

    await user.click(within(screen.getByRole("link", { name: "Сложение" }).closest("li")!).getByRole("link", { name: "+ Добавить вопрос" }));
    expect(await screen.findByRole("button", { name: "Отправить на проверку" })).toBeTruthy();
    await user.type(screen.getByLabelText("Текст вопроса (KK)"), "2 · 3 = ?");
    for (const [i, v] of ["6", "5", "9"].entries()) await user.type(screen.getByLabelText(`Вариант ${"ABC"[i]} (KK)`), v);
    await user.click(screen.getByLabelText("Вариант A правильный"));
    await user.click(screen.getByRole("button", { name: "Сохранить и следующий вопрос" }));
    await vi.waitFor(() => expect(saved[0]?.p_q.status).toBe("draft"));
  });

  it("учитель удаляет свой черновик (с подтверждением); админ — меню «⋯» у темы", async () => {
    const user = userEvent.setup();
    const ask = vi.spyOn(window, "confirm").mockReturnValue(true);
    history.replaceState(null, "", "/admin/questions/q/q2");
    const { api } = fakeApi({ id: "teacher", email: "t@x.kz", role: "teacher" });
    render(<AdminApp api={api} />);
    await user.click(await screen.findByRole("button", { name: "Удалить" }));
    expect(api.deleteQuestion).toHaveBeenCalledWith("q2");
    expect(location.pathname).toBe("/admin/questions/topic/t1");
    ask.mockRestore();
    cleanup();

    history.replaceState(null, "", "/admin/questions/math/5");
    render(<AdminApp api={fakeApi({ id: "admin", email: "a@x.kz", role: "admin" }).api} />);
    await user.click(await screen.findByRole("button", { name: "«Дроби»: действия" }));
    expect(screen.getByRole("menuitem", { name: "переименовать" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "удалить" })).toBeTruthy();
  });

  it("«На проверке»: «Опубликовать» сразу; «Вернуть» — только с причиной", async () => {
    const user = userEvent.setup();
    history.replaceState(null, "", "/admin/review");
    const { api, saved } = fakeApi({ id: "admin", email: "a@x.kz", role: "admin" });
    render(<AdminApp api={api} />);
    await user.click(await screen.findByRole("button", { name: "Вернуть" }));
    await user.click(screen.getByRole("button", { name: "Вернуть учителю" }));
    expect(screen.getByRole("alert").textContent).toBe("Напишите причину.");
    await user.type(screen.getByLabelText(/Причина возврата/), "Добавьте пояснение");
    await user.click(screen.getByRole("button", { name: "Вернуть учителю" }));
    expect(await screen.findByText("Возвращено учителю.")).toBeTruthy();
    expect(saved[0].p_q).toMatchObject({ status: "draft", review_comment: "Добавьте пояснение" });
  });

  it("сертификат автора (№103): у учителя в «Моих вопросах» — прогресс и кнопка, сертификат открывается в новой вкладке", async () => {
    history.replaceState(null, "", "/admin/my");
    const user = userEvent.setup();
    const { api } = fakeApi({ id: "teacher", email: "t@x.kz", role: "teacher" });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<AdminApp api={api} />);
    expect(await screen.findByText(/Опубликовано ваших вопросов: 52/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Получить сертификат за 50 вопросов" }));
    expect(api.issueCertificate).toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith("/cert/cert-1", "_blank", "noopener");
    open.mockRestore();
  });

  it("«Мои классы» (№102): учитель создаёт класс, видит код и ссылку, отчёт и трудные темы; убирает ученика", async () => {
    history.replaceState(null, "", "/admin/classes");
    const user = userEvent.setup();
    const { api } = fakeApi({ id: "teacher", email: "t@x.kz", role: "teacher" });
    vi.spyOn(api, "topicMin").mockResolvedValue(0); // все темы открыты — можно дать задание
    const ask = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminApp api={api} />);
    expect(await screen.findByText("Классов пока нет.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Мои классы" }).className).toBe("on");
    await user.type(screen.getByLabelText("Буква"), "б");
    await user.click(screen.getByRole("button", { name: "Создать класс" }));
    expect(api.createClass).toHaveBeenCalledWith("s1", expect.any(Number), "б");
    expect(await screen.findByText("ABC234")).toBeTruthy();
    expect(location.pathname).toBe("/admin/classes/c1");
    expect(screen.getByRole("button", { name: "Выгрузить в Excel" })).toBeTruthy();
    expect(screen.getByText(/\/me\?join=ABC234/)).toBeTruthy();
    expect(screen.getByText(/\/ru\/\d+\/math\//)).toBeTruthy(); // ссылка для задания — предмет на сайте
    expect(screen.getAllByText("Айдос К.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("45%").map((x) => x.className)).toEqual(["lvl-low", "lvl-low"]); // ученик и тема
    expect(screen.getAllByText("Дроби").length).toBeGreaterThan(0);
    // Задание со сроком (№110): тема, по умолчанию — ближайшая пятница; «выполнили 1 из 1», раскрыть — кто
    const due = screen.getByLabelText("Срок") as HTMLInputElement;
    expect(new Date(due.value).getDay()).toBe(5);
    await user.click(screen.getByRole("button", { name: "Дать задание" }));
    expect(api.createAssignment).toHaveBeenCalledWith("c1", expect.any(String), due.value);
    await user.click(await screen.findByRole("button", { name: "выполнили: 1 из 1" }));
    expect(screen.getByText("✓ 80%")).toBeTruthy();
    // «Ученики × темы»: зелёная клетка 85, мало данных — «·», тема 4 класса помечена, неактивный ученик
    expect(await screen.findByRole("heading", { name: "Ученики × темы" })).toBeTruthy();
    expect(screen.getByText("85").className).toBe("lvl-ok");
    expect(screen.getByText("·").className).toBe("lvl-none");
    expect(screen.getByText(/Сложение · тема 4 класса/)).toBeTruthy();
    expect(screen.getByText(/нет тестов больше 7 дней/)).toBeTruthy();
    await user.click(screen.getAllByRole("link", { name: "Айдос К." })[0]);
    expect(location.pathname).toBe("/admin/classes/c1/students/st1");
    expect(await screen.findByRole("heading", { name: "Айдос К." })).toBeTruthy();
    expect(screen.getByText("тестов: 3 · 45%")).toBeTruthy();
    expect(screen.getByText("1/2 + 1/4 = ?")).toBeTruthy();
    expect(screen.getByText("× 3")).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "← К классу" }));
    await user.click(screen.getByRole("button", { name: "Убрать" }));
    expect(api.removeMember).toHaveBeenCalledWith("c1", "st1");
    expect(await screen.findByText("Пока никто не вошёл.")).toBeTruthy();
    ask.mockRestore();
  });

  it("«Первые шаги» (№113): галочки по делам учителя, «Как?» — подсказка, «Перейти», «Скрыть» и возврат из меню", async () => {
    history.replaceState(null, "", "/admin/my");
    const user = userEvent.setup();
    const { api } = fakeApi({ id: "teacher", email: "t@x.kz", role: "teacher" });
    vi.spyOn(api, "topicMin").mockResolvedValue(10);
    render(<AdminApp api={api} />);
    const box = within(await screen.findByRole("region", { name: "Первые шаги" }));
    expect(box.getByText("Сделано 1 из 5. Галочки ставятся сами.")).toBeTruthy(); // вопросы есть, опубликованных нет
    const steps = box.getAllByRole("listitem");
    expect(steps.map((li) => li.className)).toEqual(["done", "next", "", "", ""]);
    await user.click(within(steps[1]).getByRole("button", { name: "Как?" }));
    expect(within(steps[1]).getByText(/«Отправить на проверку».*не меньше 10 опубликованных/)).toBeTruthy();
    await user.click(within(steps[2]).getByRole("button", { name: "Перейти →" }));
    expect(location.pathname).toBe("/admin/classes");

    await user.click(await screen.findByRole("button", { name: "Скрыть" }));
    expect(screen.queryByRole("region", { name: "Первые шаги" })).toBeNull();
    await user.click(screen.getByRole("button", { name: ADMIN.ru.menu.label }));
    await user.click(screen.getByRole("menuitem", { name: "Первые шаги" }));
    expect(await screen.findByRole("region", { name: "Первые шаги" })).toBeTruthy();
  });

  it("«Инструкция» (№114): вкладка учителя, содержание, образец Word на языке админки; «Подробнее» из «Первых шагов»", async () => {
    history.replaceState(null, "", "/admin/classes");
    const user = userEvent.setup();
    const { api } = fakeApi({ id: "teacher", email: "t@x.kz", role: "teacher" });
    vi.spyOn(api, "topicMin").mockResolvedValue(10);
    render(<AdminApp api={api} />);
    const box = within(await screen.findByRole("region", { name: "Первые шаги" }));
    await user.click(box.getAllByRole("button", { name: "Как?" })[1]); // «Создайте класс»
    await user.click(box.getByRole("link", { name: "Подробнее →" }));
    expect(location.pathname).toBe("/admin/help/class");
    expect(screen.getByRole("link", { name: "Инструкция" }).className).toBe("on");
    expect(await screen.findByRole("heading", { name: "Класс и ученики" })).toBeTruthy();
    expect(await screen.findByText(/не меньше 10 опубликованных вопросов\. Значок «3 \/ 10»/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Скачать образец Word (.docx)" }).getAttribute("href")).toBe("/samples/ulgi-ru.docx");
    const toc = within(screen.getByRole("navigation", { name: "Содержание" }));
    expect(toc.getAllByRole("link")).toHaveLength(8);
    await user.click(toc.getByRole("link", { name: "Частые вопросы" }));
    expect(location.pathname).toBe("/admin/help/faq");
    expect(screen.queryByRole("region", { name: "Первые шаги" })).toBeNull(); // на странице инструкции блока нет
  });

  it("подсказки на экранах (№115): «?» открывает статью в новой вкладке; пустые экраны подсказывают, что делать", async () => {
    localStorage.setItem("bt-start-hidden", JSON.stringify(["teacher"]));
    history.replaceState(null, "", "/admin/classes");
    const { api } = fakeApi({ id: "teacher", email: "t@x.kz", role: "teacher" });
    render(<AdminApp api={api} />);
    expect(await screen.findByText("Ниже выберите предмет, класс и букву и нажмите «Создать класс».")).toBeTruthy();
    const q = screen.getByRole("link", { name: "Инструкция: Класс и ученики" });
    expect([q.getAttribute("href"), q.getAttribute("target")]).toEqual(["/admin/help/class", "_blank"]);
    expect(screen.getByRole("heading", { name: "Мои классы" })).toBeTruthy(); // значок — рядом с заголовком, не внутри
    cleanup();

    history.replaceState(null, "", "/admin/questions/topic/t2"); // в теме «Сложение» вопросов нет
    render(<AdminApp api={api} />);
    expect(await screen.findByText(/Нажмите «\+ Добавить вопрос» или загрузите тест из файла/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Инструкция: Добавить вопрос вручную" }).getAttribute("href")).toBe("/admin/help/add");
  });

  it("«Первые шаги» не видны админу и учителю, у которого всё сделано", async () => {
    history.replaceState(null, "", "/admin/classes");
    const { api, questions } = fakeApi({ id: "teacher", email: "t@x.kz", role: "teacher" });
    questions[0].status = "published";
    vi.spyOn(api, "classes").mockResolvedValue([{ id: "c1", subject_id: "s1", grade: 5, letter: "А", join_code: "ABC234", students: 3 }]);
    vi.spyOn(api, "assignments").mockResolvedValue([{} as Assignment]);
    render(<AdminApp api={api} />);
    await screen.findByText("ABC234").catch(() => {});
    await vi.waitFor(() => expect(api.classes).toHaveBeenCalledTimes(2)); // экран и «Первые шаги»
    expect(screen.queryByRole("region", { name: "Первые шаги" })).toBeNull();
    cleanup();
    render(<AdminApp api={fakeApi({ id: "admin", email: "a@x.kz", role: "admin" }).api} />);
    await screen.findByRole("link", { name: "Пользователи" });
    expect(screen.queryByRole("region", { name: "Первые шаги" })).toBeNull();
  });

  it("«Мои вопросы»: сначала возвращённые с причиной; «Нужен перевод» — вопросы без RU или EN", async () => {
    history.replaceState(null, "", "/admin/my");
    localStorage.setItem("bt-start-hidden", JSON.stringify(["teacher"])); // «Первые шаги» — свой тест ниже
    const { api, questions } = fakeApi({ id: "teacher", email: "t@x.kz", role: "teacher" });
    questions[1].review_comment = "Нет правильного ответа";
    questions[1].text_en = null;
    render(<AdminApp api={api} />);
    const items = await screen.findAllByRole("listitem");
    expect(within(items[0]).getByText("Возвращён")).toBeTruthy();
    expect(within(items[0]).getByText(/Нет правильного ответа/)).toBeTruthy();
    // вкладки по статусу с числами; фильтр — в базе
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Черновик 1" }));
    await vi.waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    expect(screen.getByRole("button", { name: "Все 2" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Опубликован 0" }));
    expect(await screen.findByText("Здесь вопросов нет.")).toBeTruthy();
    cleanup();

    history.replaceState(null, "", "/admin/questions/translate");
    render(<AdminApp api={api} />);
    expect(await screen.findByRole("link", { name: /Неполный/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /2\+2\?/ })).toBeNull();
  });
});
