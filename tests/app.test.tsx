import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/site/App";
import type { DataSource, Question } from "../src/lib/types";

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
});
afterEach(cleanup);

describe("сайт ученика", () => {
  it("в классе — только предметы, у которых есть вопросы в этом классе", async () => {
    render(<App source={source} />);
    expect(await screen.findByRole("button", { name: /Математика/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Физика/ })).toBeNull(); // только в 7 классе
    expect(screen.queryByRole("button", { name: /Химия/ })).toBeNull(); // в 5 классе нет вопросов
  });

  it("проходит тест с клавиатуры и сохраняет лучший результат", async () => {
    const user = userEvent.setup();
    render(<App source={source} />);
    await user.click(await screen.findByRole("button", { name: /Математика/ }));
    await user.click(screen.getByRole("button", { name: "Начать" }));

    for (let i = 0; i < 5; i++) {
      await screen.findByText(`Вопрос ${i}`);
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

  it("после входа в шапке — ник с меню «Кабинет / Выйти»; без входа — «Войти»", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem("bt-me", JSON.stringify({ name: "aigerim_t", role: "teacher" }));
    try {
      render(<App source={source} />);
      expect(screen.queryByRole("link", { name: "Войти" })).toBeNull();
      await user.click(await screen.findByRole("button", { name: "Меню аккаунта" }));
      expect(screen.getByText("aigerim_t")).toBeTruthy();
      expect(screen.getByRole("menuitem", { name: "Кабинет" }).getAttribute("href")).toBe("/admin");
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("menu")).toBeNull();
    } finally {
      sessionStorage.clear();
    }
  });
});
