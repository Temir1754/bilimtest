// Загружает функции на сервере (supabase/functions) в проект Supabase.
//   npm run functions            — основной проект
//   npm run functions -- --test  — тестовый проект
// Нужен SUPABASE_ACCESS_TOKEN в .env (supabase.com → аккаунт → Access Tokens). Docker не нужен (--use-api).
// Проверку входа функции делают сами (admin-users — только админ), поэтому --no-verify-jwt.
import { spawnSync } from "node:child_process";
import { need, ROOT } from "./env";

const test = process.argv.includes("--test");
const url = need(test ? "TEST_SUPABASE_URL" : "VITE_SUPABASE_URL");
const ref = new URL(url).hostname.split(".")[0];
need("SUPABASE_ACCESS_TOKEN");

const r = spawnSync("npx", ["supabase", "functions", "deploy", "admin-users", "student-signup", "account",
  "--project-ref", ref, "--no-verify-jwt", "--use-api"], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
process.exit(r.status ?? 1);
