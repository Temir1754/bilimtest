// Общее для функций на сервере (Edge Functions): ответы, CORS, клиенты Supabase, временный пароль.
// Ключ сервера (service_role) есть только здесь, в секретах Supabase, — в браузер он не попадает.
import { createClient } from "npm:@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const env = (name: string) => {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Нет переменной ${name}`);
  return v;
};

/** Клиент с правами сервера: создание аккаунтов, функции «только для сервера». */
export const serviceClient = () =>
  createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

/** Клиент от имени того, кто вызвал функцию (его вход из заголовка Authorization). */
export const callerClient = (req: Request) =>
  createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });

/** Временный пароль: 10 знаков без похожих (0/o, 1/l/i), чтобы легко продиктовать. */
export function tempPassword(): string {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((b) => abc[b % abc.length]).join("");
}

export const NICK = /^[a-z0-9_.]{3,20}$/;
export const studentEmail = (nick: string) => `${nick}@students.bilimtest.local`;
