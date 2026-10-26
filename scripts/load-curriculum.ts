// Загружает программу класса в базу: предметы, разделы, темы (без вопросов).
//   npm run curriculum -- data/curriculum/grade4.json            — в основной проект
//   npm run curriculum -- data/curriculum/grade4.json --test     — в тестовый проект
//   npm run curriculum -- data/curriculum/grade4.json --check    — только проверить файл, базу не трогать
//   npm run curriculum -- data/curriculum/grade4.json --force    — перезаписать названия разделов и тем из файла
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { loadCurriculum, validateCurriculum, type Curriculum } from "./curriculum";
import { dbUrl } from "./env";

const file = process.argv.slice(2).find((a) => a.endsWith(".json"));
if (!file) {
  console.error("Укажите файл программы: npm run curriculum -- data/curriculum/grade4.json");
  process.exit(1);
}

let cur: Curriculum;
try {
  cur = JSON.parse(readFileSync(file, "utf8"));
} catch (e) {
  console.error(`Не получилось прочитать ${file}: ${(e as Error).message}`);
  process.exit(1);
}

const errors = validateCurriculum(cur);
const nTopics = cur.subjects?.reduce((n, s) => n + (s.sections ?? []).reduce((m, x) => m + (x.topics?.length ?? 0), 0), 0) ?? 0;
if (errors.length) {
  console.error("Ошибки в файле программы, ничего не загружено:\n" + errors.join("\n"));
  process.exit(1);
}
console.log(`${file}: ${cur.grade} класс, предметов ${cur.subjects.length}, тем ${nTopics} — файл в порядке.`);
if (process.argv.includes("--check")) process.exit(0);

const sql = postgres(dbUrl(), { ssl: "require", prepare: false, onnotice: () => {} });
try {
  const r = await sql.begin((tx) =>
    loadCurriculum({ query: (q, p) => tx.unsafe(q, p as never[]) as never }, cur, { force: process.argv.includes("--force") }));
  if (r.subjects.created.length) console.log(`Новые предметы: ${r.subjects.created.join(", ")}`);
  console.log(`Разделы: новых ${r.sections.created}, обновлено ${r.sections.updated}`);
  console.log(`Темы: новых ${r.topics.created}, обновлено ${r.topics.updated}`);
  console.log("Готово ✓ Вопросы не менялись. Темы без 5 опубликованных вопросов ученикам не видны.");
} catch (e) {
  console.error("Загрузка не выполнена, база не изменена:\n" + (e as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
