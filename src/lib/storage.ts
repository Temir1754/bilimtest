// Настройки и лучшие результаты ученика — только в его браузере (как раньше).
// Ключи bt-prefs и bt-best те же, что у старого сайта, поэтому прежние результаты сохраняются.
import { GRADES, LANGS, type Lang } from "./types";

export interface Prefs {
  lang: Lang;
  grade: number;
}

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") as T | null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* приватный режим или запрет хранилища — сайт работает и без него */
  }
}

export function loadPrefs(): Prefs {
  const p = read<Partial<Prefs>>("bt-prefs") ?? {};
  return {
    lang: LANGS.includes(p.lang as Lang) ? (p.lang as Lang) : "kk",
    grade: (GRADES as readonly number[]).includes(p.grade as number) ? (p.grade as number) : 5,
  };
}

export const savePrefs = (p: Prefs) => write("bt-prefs", p);

export type Best = Record<string, number>;

export function loadBest(): Best {
  const b = read<Best>("bt-best");
  return b && typeof b === "object" ? b : {};
}

/** Сохраняет результат, если он лучше прежнего. Возвращает обновлённую таблицу. */
export function recordBest(best: Best, topicId: string, pct: number): Best {
  const next = { ...best, [topicId]: Math.max(best[topicId] ?? 0, pct) };
  write("bt-best", next);
  return next;
}
