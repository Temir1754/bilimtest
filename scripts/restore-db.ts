// Восстановление данных базы из резервной копии (npm run backup).
//   npm run restore -- backups/2026-10-26_12-00 --yes          — основной проект
//   npm run restore -- backups/2026-10-26_12-00 --yes --test   — тестовый проект
// Все данные таблиц public заменяются данными копии, одной транзакцией: при ошибке база не меняется.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import postgres from "postgres";
import { restoreDb, type Backup } from "./backup";
import { dbUrl } from "./env";

const dir = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!dir || !existsSync(dir)) {
  console.error("Укажите папку копии: npm run restore -- backups/ГГГГ-ММ-ДД_ЧЧ-ММ --yes");
  process.exit(1);
}
if (!process.argv.includes("--yes")) {
  console.error("Восстановление заменит все вопросы, темы и разделы в базе данными копии.\n" +
    "Если вы уверены, добавьте в конце команды --yes");
  process.exit(1);
}

const backup: Backup = {};
for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  backup[f.replace(/\.json$/, "")] = JSON.parse(readFileSync(join(dir, f), "utf8"));
}

const sql = postgres(dbUrl(), { ssl: "require", prepare: false, onnotice: () => {} });
try {
  const counts = await sql.begin((tx) => restoreDb({ query: (q, p) => tx.unsafe(q, p as never[]) as never }, backup));
  for (const [t, n] of Object.entries(counts)) console.log(`  ${t}: ${n}`);
  console.log(`Готово ✓ База восстановлена из ${resolve(dir)}`);
} catch (e) {
  console.error("Восстановление не выполнено, база не изменена:\n" + (e as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
