// Резервная копия данных базы в папку backups/ГГГГ-ММ-ДД_ЧЧ-ММ/ (по файлу на таблицу).
//   npm run backup            — основной проект
//   npm run backup -- --test  — тестовый проект
// Восстановление: npm run restore -- backups/папка --yes
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import postgres from "postgres";
import { dumpDb } from "./backup";
import { dbUrl, ROOT } from "./env";

const sql = postgres(dbUrl(), { ssl: "require", prepare: false, onnotice: () => {} });
try {
  const data = await sql.begin("isolation level repeatable read read only", (tx) =>
    dumpDb({ query: (q, p) => tx.unsafe(q, p as never[]) as never }));
  const d = new Date(); // местное время компьютера
  const p2 = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}-${p2(d.getMinutes())}`;
  const dir = join(ROOT, "backups", stamp + (process.argv.includes("--test") ? "_test" : ""));
  mkdirSync(dir, { recursive: true });
  for (const [t, rows] of Object.entries(data)) writeFileSync(join(dir, `${t}.json`), JSON.stringify(rows));
  for (const [t, rows] of Object.entries(data)) console.log(`  ${t}: ${rows.length}`);
  console.log(`Готово ✓ Копия: ${relative(ROOT, dir)}`);
} catch (e) {
  console.error("Копия не сделана:\n" + (e as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
