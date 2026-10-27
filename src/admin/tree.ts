// Дерево тем в админке: разделы по порядку, в каждом — его темы; темы без раздела — в конце (DECISIONS.md №48).
// Номера тем сквозные внутри предмета и класса — в том же порядке, что на сайте. Без React — легко тестировать.
import type { SectionRow, TopicRow } from "./api";

export interface Group {
  section: SectionRow | null; // null — «Без раздела»
  topics: TopicRow[];
}

const bySort = (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order;

export function groupTopics(sections: SectionRow[], topics: TopicRow[]): Group[] {
  const known = new Set(sections.map((s) => s.id));
  const groups: Group[] = sections.slice().sort(bySort)
    .map((s) => ({ section: s, topics: topics.filter((t) => t.section_id === s.id).sort(bySort) }));
  const rest = topics.filter((t) => !t.section_id || !known.has(t.section_id)).sort(bySort);
  if (rest.length) groups.push({ section: null, topics: rest });
  return groups;
}

/** Меняет местами элементы i и i + dir. */
export function swap<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const out = list.slice();
  [out[i], out[i + dir]] = [out[i + dir], out[i]];
  return out;
}

/** Номера 0, 1, 2… по порядку; возвращает только строки, у которых номер поменялся. */
export function renumber<T extends { sort_order: number }>(list: T[]): T[] {
  return list.flatMap((x, k) => (x.sort_order === k ? [] : [{ ...x, sort_order: k }]));
}

/** Темы всех групп подряд — для сквозных номеров. */
export const flatTopics = (groups: Group[]) => groups.flatMap((g) => g.topics);
