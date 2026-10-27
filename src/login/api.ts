// Всё, что экран входа делает с базой. Экран работает через AuthApi, поэтому в тестах подставляется заглушка.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthText } from "../i18n/auth";
import { loginEmail, saveAccount, setRemember, type Account } from "../lib/account";

export interface AuthApi {
  /** Вход по email или нику (№71). Запоминает ник и роль для шапки сайта.
   *  mustChange — вошёл с временным паролем, его нужно сменить (№80–81). */
  signIn(id: string, password: string, remember: boolean): Promise<{ account: Account; mustChange: boolean }>;
  /** Новый пароль вместо временного; снимает пометку «сменить пароль». */
  changePassword(password: string): Promise<void>;
}

/** Ответы Supabase → понятный текст. */
export function authError(e: unknown, t: AuthText): string {
  const m = (e as { message?: string })?.message ?? String(e);
  const r = t.err;
  if (/Invalid login credentials/i.test(m)) return r.invalid;
  if (/Email not confirmed/i.test(m)) return r.notConfirmed;
  if (/banned/i.test(m)) return r.banned;
  if (/rate limit|For security purposes|too many/i.test(m)) return r.rateLimit;
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return r.network;
  if (/Password should be|weak.?password/i.test(m)) return t.change.short;
  return m;
}

export function supabaseAuthApi(sb: SupabaseClient): AuthApi {
  return {
    async signIn(id, password, remember) {
      setRemember(remember); // до входа: от этого зависит, где хранится вход
      const { data, error } = await sb.auth.signInWithPassword({ email: loginEmail(id), password });
      if (error) throw error;
      const { data: p, error: e2 } = await sb.from("profiles").select("role, nickname, must_change_password")
        .eq("id", data.user.id).single();
      if (e2) throw e2;
      const account: Account = { name: p.nickname || (data.user.email ?? "").split("@")[0], role: p.role };
      saveAccount(account);
      return { account, mustChange: p.must_change_password === true };
    },
    async changePassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      const { error: e2 } = await sb.rpc("password_changed");
      if (e2) throw e2;
    },
  };
}
