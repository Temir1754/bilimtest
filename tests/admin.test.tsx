import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApp } from "../src/admin/AdminApp";
import type { AdminApi, Me, QuestionItem, SectionRow, SubjectRow, TopicRow } from "../src/admin/api";
import type { QuestionRow, toPayload } from "../src/admin/form";
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
  let user = me;
  const saved: ReturnType<typeof toPayload>[] = [];
  const api: AdminApi = {
    async me() { return user; },
    onAuthChange: () => () => {},
    async signIn(email, password) {
      if (password !== "secret") throw new Error("Invalid login credentials");
      user = { id: "admin", email, role: "admin" };
    },
    async signOut() { user = null; },
    resetPassword: vi.fn(async () => {}),
    setPassword: vi.fn(async (pw: string) => { if (pw.length < 6) throw new Error("Password should be at least 6 characters."); }),
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
    saveTopic: vi.fn(async ({ id, ...x }: Omit<TopicRow, "id"> & { id?: string }) => {
      const old = topics.find((r) => r.id === id);
      if (old) Object.assign(old, x); else topics.push({ ...x, id: `t${topics.length + 1}` });
    }),
    async deleteTopic() {},
    async questions(f) {
      return questions.filter((q) => (!f.topicId || q.topic_id === f.topicId) && (!f.status || q.status === f.status) &&
        (!f.teacherCheck || q.teacher_check) &&
        (!f.sectionId || topics.find((t) => t.id === q.topic_id)?.section_id === f.sectionId))
        .map((q) => ({ ...q, updated_at: "", topics: topics[0] })) as QuestionItem[];
    },
    async question(id) { return questions.find((q) => q.id === id)!; },
    saveQuestion: vi.fn(async (p: ReturnType<typeof toPayload>) => {
      saved.push(p);
      const q = questions.find((x) => x.id === p.p_id)!;
      Object.assign(q, p.p_q, { options: p.p_options.map((o, i) => ({ ...o, sort_order: i })) });
      return q.id;
    }),
    async deleteQuestion() {},
    clearTeacherCheck: vi.fn(async (id: string) => { questions.find((q) => q.id === id)!.teacher_check = null; }),
    async exportChecks() {
      return questions.filter((q) => q.teacher_check).map((q) => ({ grade: 5, subject: subjects[0], topic: "Дроби", q }));
    },
    async uploadImage() { return "https://img/x.png"; },
    importQuestions: vi.fn(async (_s: string, _g: number, rows: unknown[]) => ({ questions: rows.length, topics: 1 })),
    async exportQuestions() { return questions.map((q) => ({ topic: "Дроби", q })); },
    publish: vi.fn(async (ids: string[]) => { for (const q of questions) if (ids.includes(q.id)) q.status = "published"; }),
  };
  return { api, saved, sections, topics };
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  localStorage.setItem("bt-prefs", JSON.stringify({ lang: "ru", grade: 5 }));
  sessionStorage.setItem("bt-admin", JSON.stringify({ grade: 5, subjectId: "s1", topicId: "t1" }));
});
afterEach(cleanup);

describe("админка", () => {
  it("вход: неверный пароль — понятная ошибка; верный — открывает список вопросов", async () => {
    const user = userEvent.setup();
    render(<AdminApp api={fakeApi(null).api} />);
    await user.type(await screen.findByLabelText("Email"), "me@school.kz");
    await user.type(screen.getByLabelText("Пароль"), "wrong");
    await user.click(screen.getByRole("button", { name: "Войти" }));
    expect(await screen.findByText("Неверный email или пароль.")).toBeTruthy();

    await user.clear(screen.getByLabelText("Пароль"));
    await user.type(screen.getByLabelText("Пароль"), "secret");
    await user.click(screen.getByRole("button", { name: "Войти" }));
    expect(await screen.findByRole("button", { name: /2\+2\?/ })).toBeTruthy();
  });

  it("«Забыли пароль?»: отправляет письмо со ссылкой", async () => {
    const user = userEvent.setup();
    const { api } = fakeApi(null);
    render(<AdminApp api={api} />);
    await user.click(await screen.findByRole("button", { name: "Забыли пароль?" }));
    expect(screen.queryByLabelText("Пароль")).toBeNull();
    await user.type(screen.getByLabelText("Email"), "me@school.kz");
    await user.click(screen.getByRole("button", { name: "Отправить ссылку" }));
    expect(await screen.findByText(/Письмо отправлено на me@school.kz/)).toBeTruthy();
    expect(api.resetPassword).toHaveBeenCalledWith("me@school.kz");
  });

  it("по ссылке из письма: новый пароль, потом админка", async () => {
    const user = userEvent.setup();
    history.replaceState(null, "", "/admin?reset");
    const { api } = fakeApi({ id: "admin", email: "a@x.kz", role: "admin" });
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
    expect(await screen.findByRole("button", { name: /2+2?/ })).toBeTruthy();
    expect(location.search).toBe("");
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
    expect(screen.queryByRole("button", { name: "На проверке" })).toBeNull();
  });

  it("админ публикует вопрос из очереди проверки, сменив правильный ответ", async () => {
    const user = userEvent.setup();
    const { api, saved } = fakeApi({ id: "admin", email: "a@x.kz", role: "admin" });
    render(<AdminApp api={api} />);
    await user.click(await screen.findByRole("button", { name: "На проверке" }));
    await user.click(await screen.findByRole("button", { name: /2\+2\?/ }));
    await user.click(await screen.findByLabelText("Вариант B правильный"));
    await user.click(screen.getByRole("button", { name: "Опубликовать" }));
    expect(await screen.findByText("Опубликовано.")).toBeTruthy();
    expect(saved[0].p_q.status).toBe("published");
    expect(saved[0].p_options.map((o) => o.is_correct)).toEqual([false, true, false]);
  });

  it("неполный вопрос не отправляется в базу при публикации", async () => {
    const user = userEvent.setup();
    const { api } = fakeApi({ id: "admin", email: "a@x.kz", role: "admin" });
    render(<AdminApp api={api} />);
    await user.click(await screen.findByRole("button", { name: /2\+2\?/ }));
    await user.click(await screen.findByRole("tab", { name: /EN/ }));
    await user.clear(screen.getByLabelText("Вариант C (EN)"));
    await user.click(screen.getByRole("button", { name: "Опубликовать" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Нет текста варианта C на английском языке.")).toBeTruthy();
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
    await user.click(await screen.findByRole("button", { name: "Загрузить из Excel" }));

    const sheet = [headers(ADMIN.ru),
      row("Дроби", "Сколько будет 1/2 + 1/2?", "1", "2", "1/4"),
      row("Новая тема", "Без неверных ответов", "1", "", ""),
    ];
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet), "Вопросы");
    const file = new File([XLSX.write(wb, { type: "array", bookType: "xlsx" })], "q.xlsx");
    await user.upload(screen.getByLabelText(/Выберите заполненный файл/), file);

    expect(await screen.findByText(/Ошибка: нужно минимум 2 неверных ответа/)).toBeTruthy();
    expect(screen.queryByText(/Будут созданы новые темы/)).toBeNull(); // «Новая тема» с ошибкой не создаётся
    await user.click(screen.getByRole("button", { name: "Загрузить 1 в черновики" }));
    expect(await screen.findByText(/загружено вопросов — 1/)).toBeTruthy();
    const rows = (api.importQuestions as ReturnType<typeof vi.fn>).mock.calls[0][2] as { topic: string }[];
    expect(rows.map((r) => r.topic)).toEqual(["Дроби"]);
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

  it("учитель не видит массовую публикацию", async () => {
    render(<AdminApp api={fakeApi({ id: "teacher", email: "t@x.kz", role: "teacher" }).api} />);
    await screen.findByRole("button", { name: /2\+2\?/ });
    expect(screen.queryByRole("button", { name: "Опубликовать готовые черновики" })).toBeNull();
  });

  it("язык админки переключается и запоминается вместе с языком сайта", async () => {
    const user = userEvent.setup();
    render(<AdminApp api={fakeApi({ id: "admin", email: "a@x.kz", role: "admin" }).api} />);
    await user.click(await screen.findByRole("button", { name: "KK" }));
    expect(screen.getByRole("button", { name: "Excel-ден жүктеу" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Тексеруде" })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("bt-prefs")!).lang).toBe("kk");
    await user.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByRole("button", { name: "Import from Excel" })).toBeTruthy();
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
    await vi.waitFor(() => expect(within(list).queryByRole("option", { name: /Физика/ })).toBeNull());
    expect(within(list).getByRole("option", { name: /Математика/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Показать все предметы" }));
    expect(within(list).getByRole("option", { name: /Физика/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Только предметы 5 класса" }));
    expect(within(list).queryByRole("option", { name: /Физика/ })).toBeNull();
  });
});
