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

/** Ответы ученика по вопросам: q — id вопроса → тема и верен ли последний ответ (тренажёр, №96). */
export type History = Record<string, { t: string; ok: boolean }>;

export const QUIZ_SIZE = 10;

/** Тренажёр (№96): сначала вопросы, где последний ответ был неверным, потом новые, потом решённые верно;
 *  внутри каждой группы — случайный порядок. */
export function pickQuestions(questions: Question[], history: History, size = QUIZ_SIZE, rnd: Rng = Math.random): Question[] {
  const rank = (q: Question) => (history[q.id] ? (history[q.id].ok ? 2 : 0) : 1);
  return [0, 1, 2].flatMap((r) => shuffle(questions.filter((q) => rank(q) === r), rnd)).slice(0, size);
}

/** Тест по теме: 10 вопросов тренажёра, варианты перемешаны. */
export function topicQuiz(topicId: string, questions: Question[], history: History = {}, rnd: Rng = Math.random): Quiz {
  return makeQuiz(topicId, pickQuestions(questions, history, QUIZ_SIZE, rnd), rnd);
}

/** «Қателермен жұмыс»: вопросы, где последний ответ был неверным. */
export function mistakesQuiz(questions: Question[], history: History, rnd: Rng = Math.random): Quiz {
  return makeQuiz(null, shuffle(questions.filter((q) => history[q.id]?.ok === false), rnd).slice(0, QUIZ_SIZE), rnd);
}

/** Уровень темы для ученика (№109): по последним ответам на вопросы темы; меньше 5 решённых вопросов — «мало данных».
 *  Пороги те же, что у учителя (№58): 80+ — знает, 50–79 — частично, меньше — не знает. */
export type Level = "none" | "low" | "mid" | "ok";
export function topicLevel(history: History, topicId: string, min = 5): { answered: number; percent: number; level: Level } {
  const { known, wrong } = topicProgress(history, topicId);
  const answered = known + wrong, percent = answered ? Math.round((known / answered) * 100) : 0;
  return { answered, percent, level: answered < min ? "none" : percent >= 80 ? "ok" : percent >= 50 ? "mid" : "low" };
}

/** «Повторить слабые темы» (№60, №109): 10 вопросов из тем «не знает» и «частично»; из «не знает» — вдвое больше.
 *  Внутри темы — как в тренажёре: сначала ошибки, потом новые. */
export function weakQuiz(questions: Question[], history: History, rnd: Rng = Math.random): Quiz {
  const lv = new Map<string, Level>();
  const level = (t: string) => lv.get(t) ?? (lv.set(t, topicLevel(history, t).level), lv.get(t)!);
  const low = questions.filter((q) => level(q.topicId) === "low"), mid = questions.filter((q) => level(q.topicId) === "mid");
  const lowTopics = new Set(low.map((q) => q.topicId)).size, midTopics = new Set(mid.map((q) => q.topicId)).size;
  const wantLow = lowTopics + midTopics ? Math.round((QUIZ_SIZE * 2 * lowTopics) / (2 * lowTopics + midTopics)) : 0;
  const a = pickQuestions(low, history, wantLow, rnd);
  const b = pickQuestions(mid, history, QUIZ_SIZE - a.length, rnd);
  const extra = pickQuestions(low.filter((q) => !a.includes(q)), history, QUIZ_SIZE - a.length - b.length, rnd);
  return makeQuiz(null, shuffle([...a, ...b, ...extra], rnd), rnd);
}

/** Сколько вопросов темы ученик знает (последний ответ верный) и сколько ошибок ждут исправления. */
export function topicProgress(history: History, topicId: string): { known: number; wrong: number } {
  let known = 0, wrong = 0;
  for (const h of Object.values(history)) if (h.t === topicId) h.ok ? known++ : wrong++;
  return { known, wrong };
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
