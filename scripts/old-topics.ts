// Пустые старые темы после переноса вопросов (DECISIONS.md №67).
//   npm run old-topics             — только показать: какие удалятся, какие скроются и почему
//   npm run old-topics -- --apply  — удалить темы без ссылок, остальные скрыть (archived)
//   … --test                       — тестовый проект
// Тема скрывается, а не удаляется, если на неё ссылаются попытки, жалобы, статистика или правки людей в админке.
// Записи истории от скриптов (сам перенос) ссылкой не считаются (DECISIONS.md №68).
// Перед --apply сделайте резервную копию: npm run backup
import postgres from "postgres";
import { dbUrl } from "./env";
import { cleanupOldTopics, emptyOldTopics, isReferenced, type OldTopic } from "./mapping";

const apply = process.argv.includes("--apply");
const why = (t: OldTopic) => [t.attempts && `попыток ${t.attempts}`, t.reports && `жалоб ${t.reports}`,
  t.stats && `статистика ${t.stats}`, t.history && `история правок ${t.history}`].filter(Boolean).join(", ");
const line = (t: OldTopic) => `  ${t.grade} кл. · ${t.subject} · ${t.title}`;

const sql = postgres(dbUrl(), { ssl: "require", prepare: false, onnotice: () => {} });
try {
  const res = await sql.begin(async (tx) => {
    const db = { query: (q: string, p?: unknown[]) => tx.unsafe(q, p as never[]) as never };
    const list = await emptyOldTopics(db);
    const del = list.filter((t) => !isReferenced(t));
    const arc = list.filter(isReferenced);
    console.log(`Пустые старые темы: ${list.length}. Удаляются (ссылок нет): ${del.length}. Скрываются: ${arc.length}.`);
    if (del.length) console.log("\nУдаляются:\n" + del.map(line).join("\n"));
    if (arc.length) console.log("\nСкрываются (на них ссылаются):\n" + arc.map((t) => `${line(t)} — ${why(t)}`).join("\n"));
    return apply ? cleanupOldTopics(db, list) : null;
  });
  if (!res) console.log("\nБаза не менялась. Чтобы удалить и скрыть: добавьте --apply");
  else console.log(`\nГотово ✓ Удалено тем: ${res.deleted}. Скрыто: ${res.archived}.`);
} catch (e) {
  console.error("\nНе выполнено, база не изменена:\n" + (e as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
