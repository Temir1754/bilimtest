// Модель данных сайта. Совпадает по смыслу с таблицами Supabase (этап 3),
// поэтому экраны не зависят от того, откуда пришли вопросы: из JSON или из базы.

export const LANGS = ["kk", "ru", "en"] as const;
export type Lang = (typeof LANGS)[number];

/** Текст на нескольких языках. Отсутствующий язык — пустая строка или undefined. */
export type Text = Partial<Record<Lang, string>>;

export interface Subject {
  id: string; // slug, например "math"
  icon: string;
  name: Text;
  onlyLang: Lang | null; // у языковых предметов вопросы только на одном языке
  sort: number;
}

export interface Topic {
  id: string;
  subjectId: string;
  grade: number;
  title: Text;
  sort: number;
  questionCount: number;
  /** Из базы: готовых вопросов на каждом языке (вопрос показывается только на языке, где он полный, №88). */
  ready?: Partial<Record<Lang, number>>;
  sectionId?: string | null;
}

/** Раздел программы: темы на сайте идут группами по разделам (№48). */
export interface Section {
  id: string;
  subjectId: string;
  grade: number;
  title: Text;
  sort: number;
}

export interface Option {
  id?: string; // из базы — для отправки ответов (submit_attempt)
  text: Text;
  correct: boolean;
}

export interface Question {
  id: string;
  topicId: string;
  text: Text;
  explanation: Text | null;
  imageUrl: string | null;
  options: Option[];
}

export interface Catalog {
  subjects: Subject[];
  topics: Topic[];
  sections?: Section[];
  /** Тема видна, если готовых вопросов на языке не меньше min (№49); без min — хотя бы один. */
  min?: number;
}

/** Откуда сайт берёт данные. Сейчас — локальные JSON, на этапе 4 — Supabase. */
export interface DataSource {
  catalog(): Promise<Catalog>;
  questions(topicIds: string[], lang: Lang): Promise<Question[]>;
}

export const GRADES = [4, 5, 6, 7, 8, 9, 10, 11] as const;

/** Сколько вопросов темы ученик увидит на этом языке. */
export const topicCount = (tp: Topic, lang: Lang) => tp.ready?.[lang] ?? tp.questionCount;

/** Темы, которые видны ученику на этом языке. */
export const visibleTopics = (c: Catalog, lang: Lang) => c.topics.filter((tp) => topicCount(tp, lang) >= (c.min ?? 1));
