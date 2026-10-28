// Недельный отчёт родителю (№106): итоги за 7 дней, сильная и слабая тема.
import { describe, expect, it } from "vitest";
import { ME } from "../src/i18n/me";
import { reportText, weekStats } from "../src/me/report";

const now = Date.parse("2026-10-28T12:00:00Z");
const run = (topic: string, score: number, daysAgo: number, total = 10) =>
  ({ subject: "π Математика", topic, grade: 6, score, total, finished_at: new Date(now - daysAgo * 864e5).toISOString() });

describe("недельный отчёт", () => {
  it("только последние 7 дней; лучшая тема от 70%, слабая — ниже 70%; смешанные тесты — в общих числах", () => {
    const w = weekStats([run("Дроби", 9, 1), run("Проценты", 4, 2), run("", 7, 3), run("Дроби", 2, 10)], now)!;
    expect(w).toEqual({ tests: 3, questions: 30, percent: 67, best: { topic: "Дроби", percent: 90 }, weak: { topic: "Проценты", percent: 40 } });
    expect(reportText("aidos07", w, ME.kk, "https://bilimtest.kz")).toBe(
      "Білімтест: aidos07 — апталық есеп\n• 3 тест, 30 сұрақ, орташа 67%\n• Жақсы: Дроби (90%)\n• Қайталау керек: Проценты (40%)\nhttps://bilimtest.kz");
  });

  it("за неделю тестов нет — отчёта нет; одна тема — без «слабой»", () => {
    expect(weekStats([run("Дроби", 9, 8)], now)).toBeNull();
    expect(weekStats([run("Дроби", 9, 1)], now)).toMatchObject({ best: { topic: "Дроби" }, weak: null });
  });
});
