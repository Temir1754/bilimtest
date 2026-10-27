// Переносит старые вопросы в темы новой программы по таблицам docs/gradeN-mapping.md (DECISIONS.md №53–54).
//   npm run move-questions                  — только проверить и показать, что изменится (база не меняется)
//   npm run move-questions -- --apply       — перенести строки ✅ и ❓; вопросы строк ⛔ остаются на месте
//                                             с пометкой «требует проверки учителем» (DECISIONS.md №66)
//   npm run move-questions -- --apply --with-none  — перенести и строки ⛔ (в предложенную ближайшую тему)
//   … --test                                — тестовый проект
// Перед --apply сделайте резервную копию: npm run backup
// Пустые старые темы после переноса: npm run old-topics
import postgres from "postgres";
import { dbUrl, ROOT } from "./env";
import { applyMoves, markForTeacher, planMoves, readMappings, type Move } from "./mapping";

const apply = process.argv.includes("--apply");
const withNone = process.argv.includes("--with-none");

const all = readMappings(ROOT);
if (all.errors.length) {
  console.error("Ошибки в таблицах переноса, ничего не сделано:\n" + all.errors.join("\n"));
  process.exit(1);
}
const moves = all.moves.filter((m) => m.mark !== "none" || withNone);
const skipped = all.moves.filter((m) => !moves.includes(m));

const stat: Record<string, { ok: number; approx: number; none: number; other: number }> = {};
for (const m of moves) {
  const s = (stat[m.file] ??= { ok: 0, approx: 0, none: 0, other: 0 });
  s[m.mark]++;
  if (!m.file.startsWith(`grade${m.grade}-`)) s.other++;
}
console.log("Переносится (✅ точно, ❓ приблизительно, ⛔ без подходящей темы; «в другой класс» — по №54):");
for (const [f, s] of Object.entries(stat)) {
  console.log(`  ${f}: ${s.ok + s.approx + s.none} — ✅ ${s.ok}, ❓ ${s.approx}, ⛔ ${s.none}; в другой класс ${s.other}`);
}
console.log(`Остаются в старых темах: ${all.kept} (темы совпали с программой)` +
  (skipped.length ? ` + ${skipped.length} вопросов ⛔ с пометкой «требует проверки учителем»` : ""));

const sql = postgres(dbUrl(), { ssl: "require", prepare: false, onnotice: () => {} });
try {
  const done = await sql.begin(async (tx) => {
    const db = { query: (q: string, p?: unknown[]) => tx.unsafe(q, p as never[]) as never };
    const plan = await planMoves(db, moves as Move[]);
    if (plan.errors.length) throw new Error(plan.errors.join("\n"));
    if (!apply) return null;
    return { moved: await applyMoves(db, plan.rows), marked: await markForTeacher(db, skipped) };
  });
  if (!done) console.log("\nПроверка пройдена ✓ Все темы и вопросы найдены в базе. Чтобы перенести: добавьте --apply");
  else {
    console.log(`\nГотово ✓ Перенесено вопросов: ${done.moved}. Старый вариант каждого вопроса сохранён в истории правок.`);
    if (skipped.length) console.log(`Помечено «требует проверки учителем»: ${done.marked}.`);
    console.log("Пустые старые темы: npm run old-topics");
  }
} catch (e) {
  console.error("\nНе выполнено, база не изменена:\n" + (e as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
