import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/site/App";
import type { DataSource, Question } from "../src/lib/types";
import { UI } from "../src/i18n/ui";

const t = UI.ru;

const questions: Question[] = Array.from({ length: 5 }, (_, i) => ({
  id: `q${i}`, topicId: "t1", text: { kk: `Сұрақ ${i}`, ru: `Вопрос ${i}`, en: `Question ${i}` },
  explanation: null, imageUrl: null,
  options: ["верно", "нет1", "нет2", "нет3"].map((s, j) => ({ text: { kk: s, ru: s, en: s }, correct: j === 0 })),
}));

const source: DataSource = {
  async catalog() {
    return {
      subjects: [
        { id: "math", icon: "π", name: { kk: "Математика", ru: "Математика", en: "Mathematics" }, onlyLang: null, sort: 0 },
        { id: "physics", icon: "⚛", name: { kk: "Физика", ru: "Физика", en: "Physics" }, onlyLang: null, sort: 1 },
        { id: "chemistry", icon: "⚗", name: { kk: "Химия", ru: "Химия", en: "Chemistry" }, onlyLang: null, sort: 2 },
      ],
      topics: [
        { id: "t1", subjectId: "math", grade: 5, title: { kk: "Т", ru: "Дроби", en: "Fractions" }, sort: 0, questionCount: 5 },
        { id: "t2", subjectId: "physics", grade: 7, title: { kk: "Т", ru: "Сила", en: "Force" }, sort: 0, questionCount: 5 },
        // тема без опубликованных вопросов: предмет в 5 классе не показывается
        { id: "t3", subjectId: "chemistry", grade: 5, title: { kk: "Т", ru: "Атом", en: "Atom" }, sort: 0, questionCount: 0 },
      ],
    };
  },
  async questions() {
    return questions;
  },
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("bt-prefs", JSON.stringify({ lang: "ru", grade: 5 }));
  window.scrollTo = () => {};
  history.replaceState(null, "", "/"); // адрес меняется вместе с экраном (№101)
});
afterEach(cleanup);

describe("сайт ученика", () => {
  it("в классе — только предметы, у которых есть вопросы в этом классе", async () => {
    render(<App source={source} />);
    expect(await screen.findByRole("button", { name: /Математика/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Физика/ })).toBeNull(); // только в 7 классе
    expect(screen.queryByRole("button", { name: /Химия/ })).toBeNull(); // в 5 классе нет вопросов
  });

  it("проходит тест с клавиатуры, сохраняет лучший результат и прогресс; ошибка — в «Работу над ошибками» (№96)", async () => {
    const user = userEvent.setup();
    render(<App source={source} />);
    await user.click(await screen.findByRole("button", { name: /Математика/ }));
    await user.click(screen.getByRole("button", { name: "Начать" }));

    for (let i = 0; i < 5; i++) {
      await screen.findByText(`${t.question} ${i + 1} / 5`);
      // Отвечаем правильно на первые 4 вопроса, на последний — неправильно.
      const opts = screen.getAllByRole("button").filter((b) => b.classList.contains("opt"));
      const right = opts.findIndex((b) => b.textContent?.includes("верно"));
      const key = i < 4 ? right + 1 : ((right + 1) % 4) + 1;
      await user.keyboard(String(key));
      expect(await screen.findByText(i < 4 ? "Верно!" : /Неверно/)).toBeTruthy();
      await user.keyboard("{Enter}");
    }

    expect(await screen.findByText("80% · Хорошо, но есть что подтянуть.")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("bt-best")!)).toEqual({ t1: 80 });

    await act(() => user.click(screen.getByRole("button", { name: "К темам" })));
    expect(screen.getByText("лучший 80%")).toBeTruthy();
    expect(screen.getByText(/выучено 4 из 5/)).toBeTruthy();
    expect(Object.keys(JSON.parse(localStorage.getItem("bt-history")!))).toHaveLength(5);

    // работа над ошибками: только вопрос, где ответ был неверным
    await user.click(screen.getByRole("button", { name: "Работа над ошибками · 1" }));
    expect(await screen.findByText(`${t.question} 1 / 1`)).toBeTruthy();
    const opts = screen.getAllByRole("button").filter((b) => b.classList.contains("opt"));
    await user.keyboard(String(opts.findIndex((b) => b.textContent?.includes("верно")) + 1));
    await user.keyboard("{Enter}");
    const back = await screen.findByRole("button", { name: "К темам" });
    await act(() => user.click(back));
    expect(screen.getByText(/выучено 5 из 5/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Работа над ошибками/ })).toBeNull();
  });

  it("из базы: темы группами по разделам; тема ниже порога на языке ученика скрыта (№48, №49)", async () => {
    const db: DataSource = {
      async catalog() {
        const c = await source.catalog();
        return { ...c, min: 5,
          sections: [{ id: "sec1", subjectId: "math", grade: 5, title: { kk: "Б", ru: "Дроби и проценты", en: "F" }, sort: 0 }],
          topics: [...c.topics.map((tp) => tp.id === "t1" ? { ...tp, sectionId: "sec1", ready: { kk: 5, ru: 5, en: 5 } } : tp),
            { id: "t4", subjectId: "math", grade: 5, sectionId: "sec1", title: { kk: "Т", ru: "Проценты", en: "P" }, sort: 1,
              questionCount: 6, ready: { kk: 6, ru: 2, en: 6 } }] };
      },
      questions: source.questions,
    };
    const user = userEvent.setup();
    render(<App source={db} />);
    await user.click(await screen.findByRole("button", { name: /Математика/ }));
    expect(screen.getByRole("heading", { name: "Дроби и проценты" })).toBeTruthy();
    expect(screen.queryByText("Проценты")).toBeNull(); // на русском только 2 готовых вопроса
    await user.click(screen.getByRole("button", { name: "KK" }));
    expect(await screen.findAllByText("Т", { selector: "b" })).toHaveLength(2); // на казахском видны обе темы
  });

  it("жалоба на вопрос после ответа; результат теста уходит в базу", async () => {
    const report = vi.fn(async () => ({ ok: true }));
    const submit = vi.fn(async () => {});
    const user = userEvent.setup();
    render(<App source={{ ...source, report, submit }} />);
    await user.click(await screen.findByRole("button", { name: /Математика/ }));
    await user.click(screen.getByRole("button", { name: "Начать" }));
    await screen.findByText(`${t.question} 1 / 5`);
    expect(screen.queryByRole("button", { name: /Нашёл ошибку/ })).toBeNull(); // до ответа кнопки нет
    await user.keyboard("1");
    await user.click(screen.getByRole("button", { name: /Нашёл ошибку/ }));
    await user.type(screen.getByLabelText("Что не так в вопросе?"), "Два верных ответа");
    await user.click(screen.getByRole("button", { name: "Отправить" }));
    expect(await screen.findByText("Спасибо! Учитель проверит.")).toBeTruthy();
    expect(report).toHaveBeenCalledWith(expect.stringMatching(/^q\d$/), "Два верных ответа", "ru", "");

    for (let i = 0; i < 5; i++) {
      if (i) { await screen.findByText(`${t.question} ${i + 1} / 5`); await user.keyboard("1"); }
      await user.keyboard("{Enter}");
    }
    await screen.findByText(/Результат/);
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ subjectId: "math", grade: 5, topicId: "t1" }));
    expect((submit.mock.calls[0] as unknown as [{ answers: unknown[] }])[0].answers).toHaveLength(5);
  });

  it("ссылка из Google /kk/5/math/drobi/ открывает язык, класс, предмет и тему; «назад» — главная (№101)", async () => {
    history.replaceState(null, "", "/");
    history.pushState(null, "", "/kk/5/math/t/");
    render(<App source={source} />);
    expect(await screen.findByRole("heading", { name: "Математика" })).toBeTruthy();
    expect(document.querySelector(".topics li.focus")).toBeTruthy(); // тема «Т» подсвечена
    expect(screen.getByRole("button", { name: "KK" }).getAttribute("aria-pressed")).toBe("true");
    await act(async () => { history.back(); await new Promise((r) => setTimeout(r, 50)); });
    expect(await screen.findByText(/тегін тесттер/)).toBeTruthy();
  });

  it("вошедший ученик: прогресс из аккаунта на любом устройстве; в подвале — «сохраняются в аккаунте» (№104)", async () => {
    const progress = vi.fn(async () => ({ q0: { t: "t1", ok: true }, q1: { t: "t1", ok: true }, q2: { t: "t1", ok: false } }));
    const user = userEvent.setup();
    render(<App source={{ ...source, progress }} />);
    expect(await screen.findByText(/Твои результаты сохраняются в аккаунте/)).toBeTruthy();
    await user.click(await screen.findByRole("button", { name: /Математика/ }));
    expect(screen.getByText(/выучено 2 из 5/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Работа над ошибками · 1" })).toBeTruthy();
    expect(Object.keys(JSON.parse(localStorage.getItem("bt-history")!))).toHaveLength(3);
  });

  it("уровень темы и «Повторить слабые темы» (№109)", async () => {
    // в теме t1: 5 вопросов, верно 2 — «слабо»
    localStorage.setItem("bt-history", JSON.stringify({ q0: { t: "t1", ok: true }, q1: { t: "t1", ok: true },
      q2: { t: "t1", ok: false }, q3: { t: "t1", ok: false }, q4: { t: "t1", ok: false } }));
    const user = userEvent.setup();
    render(<App source={source} />);
    await user.click(await screen.findByRole("button", { name: /Математика/ }));
    expect(screen.getByText("слабо").className).toBe("lv lv-low");
    await user.click(screen.getByRole("button", { name: "Повторить слабые темы · 1" }));
    expect(await screen.findByText(/Повторить слабые темы/, { selector: ".qmeta span" })).toBeTruthy();
  });

  it("ссылка из задания /t/id темы открывает её предмет и класс (№110)", async () => {
    history.replaceState(null, "", "/t/00000000-0000-4000-8000-000000000002");
    const db: DataSource = { ...source, async catalog() {
      const cat = await source.catalog();
      return { ...cat, topics: [...cat.topics, { id: "00000000-0000-4000-8000-000000000002", subjectId: "physics", grade: 8,
        title: { kk: "Қысым", ru: "Давление", en: "Pressure" }, sort: 0, questionCount: 5 }] };
    } };
    render(<App source={db} />);
    expect(await screen.findByRole("heading", { name: "Физика" })).toBeTruthy();
    expect(screen.getByText("Давление")).toBeTruthy();
    expect(document.querySelector(".topics li.focus")?.textContent).toContain("Давление");
  });

  it("вошедший ученик видит свой класс; другие — по ссылке «Сменить класс»; гость — все классы (№111)", async () => {
    sessionStorage.setItem("bt-me", JSON.stringify({ name: "aidos07", role: "student" }));
    const user = userEvent.setup();
    render(<App source={source} />);
    expect(await screen.findByText("5 класс", { selector: "b" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Класс" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Сменить класс" }));
    await user.click(screen.getByRole("button", { name: /^7/ }));
    expect(await screen.findByText("7 класс", { selector: "b" })).toBeTruthy(); // выбрал — снова только свой выбор
    expect(screen.getByRole("button", { name: /Физика/ })).toBeTruthy();
    sessionStorage.removeItem("bt-me");
  });

  it("главная гостя: две кнопки, пример задания, схема для учителя, частые вопросы; у вошедшего ученика их нет (№120, №122)", async () => {
    const user = userEvent.setup();
    render(<App source={source} />);
    expect(await screen.findByRole("heading", { level: 1, name: /Пройди тест/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Выбрать тест/ }).getAttribute("href")).toBe("#catalog");
    expect(screen.getByRole("link", { name: /Я учитель/ }).getAttribute("href")).toBe("#teachers");
    expect(screen.getByText("2", { selector: ".facts2 b" })).toBeTruthy(); // предметов — только с видимыми темами (химии нет)
    // пример: неверный ответ → подсказка и правильный; «Ещё раз» — снова можно отвечать
    await user.click(screen.getByRole("button", { name: "½" }));
    expect(screen.getByText("Неверно. Правильный ответ — 1.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "1" }).className).toBe("ok");
    await user.click(screen.getByRole("button", { name: "Ещё раз" }));
    await user.click(screen.getByRole("button", { name: "1" }));
    expect(screen.getByText("Верно!")).toBeTruthy();
    // учителям: вход и адрес администратора; выбор класса — в разделе «Выбери тест»
    expect(screen.getByRole("link", { name: /Войти в кабинет/ }).getAttribute("href")).toBe("/login");
    expect(screen.getByRole("link", { name: /@/ }).getAttribute("href")).toMatch(/^mailto:/);
    expect(screen.getByRole("region", { name: "Выбери тест" }).querySelector(".grades")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "От файла до задания" })).toBeTruthy(); // схема для учителя (№122)
    expect(screen.getAllByText(/^(Загрузите файл|Проверьте|Откройте класс|Дайте задание|Смотрите отчёт)$/)).toHaveLength(5);
    expect(screen.getByText("Что такое Білімтест?")).toBeTruthy();
    expect(screen.getByText("Нужна ли регистрация?")).toBeTruthy();
    cleanup();

    sessionStorage.setItem("bt-me", JSON.stringify({ name: "aidos07", role: "student" }));
    render(<App source={source} />);
    expect(await screen.findByText("5 класс", { selector: "b" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Я учитель/ })).toBeNull();
    expect(screen.queryByText("Нужна ли регистрация?")).toBeNull();
    sessionStorage.removeItem("bt-me");
  });

  it("переключает язык интерфейса", async () => {
    const user = userEvent.setup();
    render(<App source={source} />);
    await user.click(await screen.findByRole("button", { name: "EN" }));
    expect(screen.getByText("Free tests for grades 4–11")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("bt-prefs")!).lang).toBe("en");
    expect(screen.getByRole("link", { name: "Log in" }).getAttribute("href")).toBe("/login");
    expect(screen.getByRole("link", { name: "Privacy policy" }).getAttribute("href")).toBe("/privacy");
  });

  it("после входа в шапке — ник с меню «Кабинет / Админка / Выйти»; без входа — «Войти»", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem("bt-me", JSON.stringify({ name: "aigerim_t", role: "teacher" }));
    try {
      render(<App source={source} />);
      expect(screen.queryByRole("link", { name: "Войти" })).toBeNull();
      await user.click(await screen.findByRole("button", { name: "Меню аккаунта" }));
      expect(screen.getByText("aigerim_t")).toBeTruthy();
      expect(screen.getByRole("menuitem", { name: "Кабинет" }).getAttribute("href")).toBe("/admin");
      expect(screen.getByRole("menuitem", { name: "Админка" }).getAttribute("href")).toBe("/admin");
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("menu")).toBeNull();
    } finally {
      sessionStorage.clear();
    }
  });

  it("у ученика в меню ника нет пункта «Админка»", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem("bt-me", JSON.stringify({ name: "kid07", role: "student" }));
    try {
      render(<App source={source} />);
      await user.click(await screen.findByRole("button", { name: "Меню аккаунта" }));
      expect(screen.getByRole("menuitem", { name: "Кабинет" })).toBeTruthy();
      expect(screen.queryByRole("menuitem", { name: "Админка" })).toBeNull();
    } finally {
      sessionStorage.clear();
    }
  });
});
