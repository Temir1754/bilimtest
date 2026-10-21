// Применяет миграции из supabase/migrations к базе.
//   npm run db:push            — основной проект
//   npm run db:push -- --test  — тестовый проект
import { spawnSync } from "node:child_process";
import { dbUrl, ROOT } from "./env";

const args = ["supabase", "db", "push", "--db-url", dbUrl(), "--yes"];
const r = spawnSync("npx", args, { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
process.exit(r.status ?? 1);
