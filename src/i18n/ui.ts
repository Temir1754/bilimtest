import type { Lang } from "../lib/types";

// Тексты интерфейса. Перенесены из legacy/template.html; новые строки — в конце каждого языка.
const kk = {
  h1: "4–11 сыныптарға арналған тегін тесттер",
  lede: "Сыныбыңды және пәнді таңда, тақырып бойынша тест тапсыр. Нәтиже бірден шығады, қателеріңді көресің.",
  grade: "Сынып", subjects: "Пәндер", topics: "тақырып", qs: "сұрақ", start: "Бастау",
  mixed: "Аралас тест", mixedHint: "барлық тақырыптан 10 сұрақ",
  all: "← Барлық пәндер", toTopics: "← Тақырыптар", question: "Сұрақ", next: "Келесі", finish: "Нәтижені көру",
  right: "Дұрыс!", wrong: "Қате. Дұрыс жауап:", result: "Нәтиже", retry: "Қайта тапсыру", nextTopic: "Келесі тақырып",
  best: "ең жақсы", yours: "Сенің жауабың", correct: "Дұрыс жауап",
  free: "Тегін. Тіркелмей-ақ тест тапсыруға болады, нәтижелер осы құрылғыда сақталады.", subjCount: "пән", langCount: "тіл",
  onlyLang: {
    kk: "Бұл пәннің тесттері қазақ тілінде.",
    ru: "Бұл пәннің тесттері орыс тілінде.",
    en: "Бұл пәннің тесттері ағылшын тілінде.",
  } as Record<Lang, string>,
  msg: ["Тақырыпты қайталап, тағы көр.", "Жақсы, бірақ әлі де жетілдіруге болады.", "Тамаша нәтиже!"],
  keys: "Пернетақта: 1–4 жауап, Enter келесі",
  gl: (g: number) => g + "-сынып", gs: "сынып",
  loading: "Жүктелуде…", loadError: "Деректерді жүктеу мүмкін болмады. Бетті жаңартып көріңіз.",
  skip: "Мазмұнға өту",
  login: "Кіру", privacy: "Құпиялылық саясаты",
  menu: { label: "Аккаунт мәзірі", cabinet: "Кабинет", admin: "Әкімші панелі", logout: "Шығу" },
  // тренажёр (№96)
  known: (k: number, n: number) => `меңгерілді ${k} / ${n}`, mistakes: "Қателермен жұмыс", mistakesHint: "қате жауап берген сұрақтарың",
  why: "Түсіндірме:", tenOf: (n: number) => `әр жолы ${n} сұрақтың 10-ы`,
};

export type UiText = typeof kk;

const ru: UiText = {
  h1: "Бесплатные тесты для 4–11 классов",
  lede: "Выбери класс и предмет, пройди тест по теме. Результат сразу, с разбором ошибок.",
  grade: "Класс", subjects: "Предметы", topics: "темы", qs: "вопросов", start: "Начать",
  mixed: "Смешанный тест", mixedHint: "10 вопросов из всех тем",
  all: "← Все предметы", toTopics: "← К темам", question: "Вопрос", next: "Дальше", finish: "Показать результат",
  right: "Верно!", wrong: "Неверно. Правильный ответ:", result: "Результат", retry: "Пройти ещё раз", nextTopic: "Следующая тема",
  best: "лучший", yours: "Твой ответ", correct: "Правильный ответ",
  free: "Бесплатно. Проходить тесты можно без регистрации, результаты сохраняются на этом устройстве.", subjCount: "предметов", langCount: "языка",
  onlyLang: {
    kk: "Тесты по этому предмету на казахском языке.",
    ru: "Тесты по этому предмету на русском языке.",
    en: "Тесты по этому предмету на английском языке.",
  },
  msg: ["Повтори тему и попробуй ещё раз.", "Хорошо, но есть что подтянуть.", "Отличный результат!"],
  keys: "Клавиатура: 1–4 ответ, Enter дальше",
  gl: (g) => g + " класс", gs: "класс",
  loading: "Загрузка…", loadError: "Не удалось загрузить данные. Попробуйте обновить страницу.",
  skip: "Перейти к содержимому",
  login: "Войти", privacy: "Политика конфиденциальности",
  menu: { label: "Меню аккаунта", cabinet: "Кабинет", admin: "Админка", logout: "Выйти" },
  // тренажёр (№96)
  known: (k, n) => `выучено ${k} из ${n}`, mistakes: "Работа над ошибками", mistakesHint: "вопросы, где ты ошибся",
  why: "Пояснение:", tenOf: (n) => `каждый раз 10 из ${n} вопросов`,
};

const en: UiText = {
  h1: "Free tests for grades 4–11",
  lede: "Pick your grade and subject, then take a test on any topic. You get your score right away, with every mistake explained.",
  grade: "Grade", subjects: "Subjects", topics: "topics", qs: "questions", start: "Start",
  mixed: "Mixed test", mixedHint: "10 questions from all topics",
  all: "← All subjects", toTopics: "← Topics", question: "Question", next: "Next", finish: "See result",
  right: "Correct!", wrong: "Wrong. The correct answer:", result: "Result", retry: "Try again", nextTopic: "Next topic",
  best: "best", yours: "Your answer", correct: "Correct answer",
  free: "Free. You can take tests without signing up; results are saved on this device.", subjCount: "subjects", langCount: "languages",
  onlyLang: {
    kk: "Tests for this subject are in Kazakh.",
    ru: "Tests for this subject are in Russian.",
    en: "Tests for this subject are in English.",
  },
  msg: ["Review the topic and try again.", "Good, with room to improve.", "Excellent result!"],
  keys: "Keyboard: 1–4 to answer, Enter for next",
  gl: (g) => "Grade " + g, gs: "grade",
  loading: "Loading…", loadError: "Could not load data. Try refreshing the page.",
  skip: "Skip to content",
  login: "Log in", privacy: "Privacy policy",
  menu: { label: "Account menu", cabinet: "Dashboard", admin: "Admin panel", logout: "Log out" },
  // тренажёр (№96)
  known: (k, n) => `learned ${k} of ${n}`, mistakes: "Work on mistakes", mistakesHint: "questions you got wrong",
  why: "Explanation:", tenOf: (n) => `10 of ${n} questions each time`,
};

export const UI: Record<Lang, UiText> = { kk, ru, en };
