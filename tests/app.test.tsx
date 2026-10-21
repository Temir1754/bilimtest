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
      subjects: [{ id: "math", icon: "π", name: { kk: "Математика", ru: "Математика", en: "Mathematics" }, onlyLang: null, sort: 0 }],
      topics: [{ id: "t1", subjectId: "math", grade: 5, title: { kk: "Т", ru: "Дроби", en: "Fractions" }, sort: 0, questionCount: 5 }],
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
  });
});
