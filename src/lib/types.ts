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
}

export interface Option {
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
}

/** Откуда сайт берёт данные. Сейчас — локальные JSON, на этапе 4 — Supabase. */
export interface DataSource {
  catalog(): Promise<Catalog>;
  questions(topicIds: string[]): Promise<Question[]>;
}

export const GRADES = [4, 5, 6, 7, 8, 9, 10, 11] as const;
