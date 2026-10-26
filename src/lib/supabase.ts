// Подключение к Supabase из браузера. Только publishable-ключ: доступ ограничивают правила RLS.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

/** Один клиент на всё приложение; создаётся при первом обращении. */
export function supabase(): SupabaseClient {
  if (!url || !key) throw new Error("Нет VITE_SUPABASE_URL или VITE_SUPABASE_PUBLISHABLE_KEY в .env");
  return (client ??= createClient(url, key));
}
