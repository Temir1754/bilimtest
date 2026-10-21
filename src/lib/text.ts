import { LANGS, type Lang, type Text } from "./types";

/** Текст на выбранном языке; если его нет — на первом доступном. */
export function tx(t: Text | null | undefined, lang: Lang): string {
  if (!t) return "";
  let s = t[lang] || LANGS.map((l) => t[l]).find(Boolean) || "";
  // В английском десятичная точка: 2,5 → 2.5 (как на старом сайте).
  if (lang === "en") s = s.replace(/(\d),(\d)/g, "$1.$2");
  return s;
}

export type Part = { math: false; text: string } | { math: true; text: string; display: boolean };

/**
 * Делит строку на обычный текст и формулы \( … \) (в строке) и \[ … \] (отдельной строкой).
 * Знак $ формулой не считается: в информатике есть ссылки вида $A$1.
 */
export function parseMath(s: string): Part[] {
  const parts: Part[] = [];
  const re = /\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g;
  let last = 0;
  for (let m; (m = re.exec(s)); ) {
    if (m.index > last) parts.push({ math: false, text: s.slice(last, m.index) });
    parts.push(m[1] !== undefined
      ? { math: true, text: m[1], display: false }
      : { math: true, text: m[2], display: true });
    last = re.lastIndex;
  }
  if (last < s.length) parts.push({ math: false, text: s.slice(last) });
  return parts;
}

export const hasMath = (s: string) => /\\\(|\\\[/.test(s);
