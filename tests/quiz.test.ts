import { describe, expect, it } from "vitest";
import {
  answer, correctIndex, isCorrect, level, mixedQuiz, MIXED_SIZE, percent, score, shuffle, topicQuiz,
} from "../src/lib/quiz";
import type { Question } from "../src/lib/types";

const q = (id: string, nOpts = 4): Question => ({
  id, topicId: "t", text: { ru: id }, explanation: null, imageUrl: null,
  options: Array.from({ length: nOpts }, (_, j) => ({ text: { ru: `${id}-${j}` }, correct: j === 0 })),
});

// Детерминированный генератор, чтобы тесты не зависели от случайности.
function seeded(seed = 1) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

describe("shuffle", () => {
  it("сохраняет все элементы и не меняет исходный массив", () => {
    const a = [1, 2, 3, 4, 5];
    const s = shuffle(a, seeded());
    expect(s.slice().sort()).toEqual(a);
    expect(a).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("topicQuiz", () => {
  it("оставляет порядок вопросов, а правильный ответ находится после перемешивания", () => {
    const qs = [q("a"), q("b"), q("c")];
    const quiz = topicQuiz("t", qs, seeded(7));
    expect(quiz.items.map((it) => it.question.id)).toEqual(["a", "b", "c"]);
    for (const it of quiz.items) {
      expect(it.options).toHaveLength(4);
      expect(it.options.filter((o) => o.correct)).toHaveLength(1);
      expect(it.options[correctIndex(it)].text.ru).toBe(`${it.question.id}-0`);
    }
  });

  it("поддерживает 3 варианта ответа", () => {
    const quiz = topicQuiz("t", [q("a", 3)]);
    expect(quiz.items[0].options).toHaveLength(3);
  });
});

describe("mixedQuiz", () => {
  it("берёт 10 разных вопросов, если их больше", () => {
    const qs = Array.from({ length: 15 }, (_, i) => q(String(i)));
    const quiz = mixedQuiz(qs, seeded(3));
    expect(quiz.items).toHaveLength(MIXED_SIZE);
    expect(new Set(quiz.items.map((it) => it.question.id)).size).toBe(MIXED_SIZE);
    expect(quiz.topicId).toBeNull();
  });

  it("берёт все вопросы, если их меньше 10", () => {
    expect(mixedQuiz([q("a"), q("b")]).items).toHaveLength(2);
  });
});

describe("проверка ответов и подсчёт", () => {
  it("засчитывает только правильный вариант", () => {
    let quiz = topicQuiz("t", [q("a"), q("b"), q("c")], seeded(5));
    const right = (k: number) => correctIndex(quiz.items[k]);
    quiz = answer(quiz, 0, right(0));
    quiz = answer(quiz, 1, (right(1) + 1) % 4);
    quiz = answer(quiz, 2, right(2));
    expect(isCorrect(quiz.items[0], quiz.answers[0])).toBe(true);
    expect(isCorrect(quiz.items[1], quiz.answers[1])).toBe(false);
    expect(score(quiz)).toBe(2);
  });

  it("не даёт изменить ответ и игнорирует несуществующий вариант", () => {
    let quiz = topicQuiz("t", [q("a", 3)]);
    expect(answer(quiz, 0, 3)).toBe(quiz);
    quiz = answer(quiz, 0, 1);
    expect(answer(quiz, 0, 2).answers[0]).toBe(1);
  });

  it("неотвеченный вопрос не засчитывается", () => {
    expect(isCorrect(topicQuiz("t", [q("a")]).items[0], null)).toBe(false);
  });

  it("проценты и уровни как на старом сайте", () => {
    expect(percent(2, 3)).toBe(67);
    expect(percent(0, 0)).toBe(0);
    expect([level(59), level(60), level(89), level(90)]).toEqual([0, 1, 1, 2]);
  });
});
