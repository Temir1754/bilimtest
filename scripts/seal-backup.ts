// Шифрует копию базы (DECISIONS.md №105).
//   npm run seal -- backups/папка файл.bbak   — папку копии → зашифрованный файл (пароль — BACKUP_PASSWORD)
//   npm run unseal -- файл.bbak               — зашифрованный файл → папка backups/имя-файла/ для npm run restore
// Пароль берётся из BACKUP_PASSWORD (в .env или в настройках GitHub).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { need, ROOT } from "./env";
import { seal, unseal } from "./seal";

const [mode, from, to] = [process.argv[2], process.argv[3], process.argv[4]];
const password = need("BACKUP_PASSWORD");
try {
  if (mode === "seal" && from && to) {
    const files = Object.fromEntries(readdirSync(from).filter((f) => f.endsWith(".json"))
      .map((f) => [f, readFileSync(join(from, f), "utf8")]));
    writeFileSync(to, seal(files, password));
    console.log(`Готово ✓ ${Object.keys(files).length} таблиц → ${to}`);
  } else if (mode === "unseal" && from) {
    const files = unseal(readFileSync(from), password);
    const dir = join(ROOT, "backups", basename(from).replace(/\.[^.]+$/, ""));
    mkdirSync(dir, { recursive: true });
    for (const [f, text] of Object.entries(files)) writeFileSync(join(dir, f), text);
    console.log(`Готово ✓ Папка: ${relative(ROOT, dir)}\nВернуть базу к копии: npm run restore -- ${relative(ROOT, dir)} --yes`);
  } else {
    console.error("Как запускать: npm run seal -- backups/папка файл.bbak  или  npm run unseal -- файл.bbak");
    process.exitCode = 1;
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
}
