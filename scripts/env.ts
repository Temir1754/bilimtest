// Чтение настроек из .env для скриптов (не для браузера).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RawSubject } from "../src/lib/legacy";

export const ROOT = join(import.meta.dirname, "..");

if (existsSync(join(ROOT, ".env"))) process.loadEnvFile(join(ROOT, ".env"));

/** Значение из .env; если его нет — понятное сообщение и выход. */
export function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`\nНе задано ${name} в файле .env.\nОткройте .env (образец — .env.example) и впишите значение.\n`);
    process.exit(1);
  }
  return v;
}

/** Адрес базы: основной проект или тестовый (флаг --test). */
export function dbUrl(): string {
  const test = process.argv.includes("--test");
  const url = need(test ? "TEST_DB_URL" : "SUPABASE_DB_URL");
  if (test && url === process.env.SUPABASE_DB_URL?.trim()) {
    console.error("\nTEST_DB_URL совпадает с SUPABASE_DB_URL. Тесты стирают данные — нужен отдельный проект.\n");
    process.exit(1);
  }
  return url;
}

export function readData(): { file: string; raw: RawSubject }[] {
  const dir = join(ROOT, "data");
  return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => ({
    file: f.replace(/\.json$/, ""),
    raw: JSON.parse(readFileSync(join(dir, f), "utf8")) as RawSubject,
  }));
}
