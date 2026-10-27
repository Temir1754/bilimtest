// Подключение к Supabase из браузера. Только publishable-ключ: доступ ограничивают правила RLS.
// Этот файл тянет библиотеку supabase-js (~50 КБ), поэтому его подключают только экраны входа, кабинеты и админка.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { REMEMBER_KEY } from "./account";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);

// «Мені есте сақта»: отмечено — вход хранится в localStorage и помнится; нет — в sessionStorage
// и забывается при закрытии браузера (удобно для общего компьютера в школе).
const safe = <T>(fn: () => T, fallback: T): T => { try { return fn(); } catch { return fallback; } };
const remembered = () => safe(() => localStorage.getItem(REMEMBER_KEY) === "1", false);
const authStorage = {
  getItem: (k: string) => safe(() => sessionStorage.getItem(k) ?? localStorage.getItem(k), null),
  setItem: (k: string, v: string) => safe(() => {
    const [keep, drop] = remembered() ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
    keep.setItem(k, v);
    drop.removeItem(k);
  }, undefined),
  removeItem: (k: string) => safe(() => { localStorage.removeItem(k); sessionStorage.removeItem(k); }, undefined),
};

let client: SupabaseClient | null = null;

/** Один клиент на всё приложение; создаётся при первом обращении. */
export function supabase(): SupabaseClient {
  if (!url || !key) throw new Error("Нет VITE_SUPABASE_URL или VITE_SUPABASE_PUBLISHABLE_KEY в .env");
  return (client ??= createClient(url, key, { auth: { storage: authStorage } }));
}
