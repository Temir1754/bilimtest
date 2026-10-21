// Источник данных из локальных data/*.json (до подключения Supabase).
import { convertSubject, sortIndex, type RawSubject } from "./legacy";
import type { Catalog, DataSource, Question } from "./types";

const files = import.meta.glob<RawSubject>("../../data/*.json", { eager: true, import: "default" });

function build() {
  const raws = Object.values(files).sort((a, b) => sortIndex(a.id) - sortIndex(b.id) || a.id.localeCompare(b.id));
  const catalog: Catalog = { subjects: [], topics: [] };
  const byTopic = new Map<string, Question[]>();
  raws.forEach((raw, i) => {
    const { subject, topics, questions } = convertSubject(raw, i);
    catalog.subjects.push(subject);
    catalog.topics.push(...topics);
    for (const q of questions) {
      const list = byTopic.get(q.topicId) ?? [];
      list.push(q);
      byTopic.set(q.topicId, list);
    }
  });
  return { catalog, byTopic };
}

let cache: ReturnType<typeof build> | null = null;
const data = () => (cache ??= build());

export const localSource: DataSource = {
  async catalog() {
    return data().catalog;
  },
  async questions(topicIds) {
    return topicIds.flatMap((id) => data().byTopic.get(id) ?? []);
  },
};
