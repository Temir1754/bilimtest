// Логика теста: перемешивание, проверка ответов, подсчёт результата. Без React — легко тестировать.
import type { Option, Question } from "./types";

export type Rng = () => number;

export function shuffle<T>(arr: readonly T[], rnd: Rng = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface QuizItem {
  question: Question;
  options: Option[]; // в перемешанном порядке
}

export interface Quiz {
  topicId: string | null; // null — смешанный тест
  items: QuizItem[];
  answers: (number | null)[]; // индекс выбранного варианта в items[k].options
}

export const MIXED_SIZE = 10;

/** Тест по теме: вопросы по порядку, варианты перемешаны. */
export function topicQuiz(topicId: string, questions: Question[], rnd: Rng = Math.random): Quiz {
  return makeQuiz(topicId, questions, rnd);
}

/** Смешанный тест: MIXED_SIZE случайных вопросов из всех тем предмета. */
export function mixedQuiz(questions: Question[], rnd: Rng = Math.random): Quiz {
  return makeQuiz(null, shuffle(questions, rnd).slice(0, MIXED_SIZE), rnd);
}

function makeQuiz(topicId: string | null, questions: Question[], rnd: Rng): Quiz {
  return {
    topicId,
    items: questions.map((question) => ({ question, options: shuffle(question.options, rnd) })),
    answers: questions.map(() => null),
  };
}

export const correctIndex = (item: QuizItem) => item.options.findIndex((o) => o.correct);

export function isCorrect(item: QuizItem, picked: number | null): boolean {
  return picked !== null && item.options[picked]?.correct === true;
}

/** Записывает ответ. Повторный ответ на тот же вопрос не принимается (как на старом сайте). */
export function answer(quiz: Quiz, index: number, picked: number): Quiz {
  if (quiz.answers[index] !== null) return quiz;
  if (picked < 0 || picked >= quiz.items[index].options.length) return quiz;
  const answers = quiz.answers.slice();
  answers[index] = picked;
  return { ...quiz, answers };
}

export function score(quiz: Quiz): number {
  return quiz.items.filter((it, k) => isCorrect(it, quiz.answers[k])).length;
}

export function percent(correct: number, total: number): number {
  return total ? Math.round((correct / total) * 100) : 0;
}

/** 0 — повторить тему, 1 — хорошо, 2 — отлично. Пороги как на старом сайте. */
export function level(pct: number): 0 | 1 | 2 {
  return pct >= 90 ? 2 : pct >= 60 ? 1 : 0;
}
