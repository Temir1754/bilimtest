// Загружает data/*.json в Supabase со статусом published.
//   npm run import            — в основной проект
//   npm run import -- --test  — в тестовый проект
//   npm run import -- --force — перезаписать уже загруженное содержимым из JSON
import postgres from "postgres";
import { validateSubject } from "../src/lib/legacy";
import { dbUrl, readData } from "./env";
import { importSubjects } from "./importer";

const files = readData();
const errors = files.flatMap(({ file, raw }) => validateSubject(file, raw));
if (errors.length) {
  console.error("Ошибки в data/*.json, импорт не выполнен:\n" + errors.join("\n"));
  process.exit(1);
}

const sql = postgres(dbUrl(), { ssl: "require", prepare: false, onnotice: () => {} });
try {
  const report = await sql.begin((tx) =>
    importSubjects({ query: (q, p) => tx.unsafe(q, p as never[]) as never }, files.map((f) => f.raw),
      { force: process.argv.includes("--force") }));
  const { inserted: i, updated: u, expected: e, found: f } = report;
  console.log(`Добавлено: предметов ${i.subjects}, тем ${i.topics}, вопросов ${i.questions}, вариантов ${i.options}`);
  if (u.subjects + u.topics + u.questions) {
    console.log(`Обновлено: предметов ${u.subjects}, тем ${u.topics}, вопросов ${u.questions}, вариантов ${u.options}`);
  }
  console.log(`В базе из data/: предметов ${f.subjects} из ${e.subjects}, тем ${f.topics} из ${e.topics}, ` +
    `опубликованных вопросов ${f.questions} из ${e.questions}`);
  if (f.subjects !== e.subjects || f.topics !== e.topics || f.questions !== e.questions) {
    console.error("Количество не совпадает!");
    process.exitCode = 1;
  } else {
    console.log("Сверка пройдена ✓");
  }
} catch (e) {
  console.error("Импорт не выполнен, база не изменена:\n" + (e as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
