// Всё, что экран входа делает с базой. Экран работает через AuthApi, поэтому в тестах подставляется заглушка.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthText } from "../i18n/auth";
import { loginEmail, saveAccount, setRemember, type Account } from "../lib/account";
import { loadPrefs, savePrefs } from "../lib/storage";

export interface AuthApi {
  /** Вход по email или нику (№71). Запоминает ник и роль для шапки сайта.
   *  mustChange — вошёл с временным паролем, его нужно сменить (№80–81). */
  signIn(id: string, password: string, remember: boolean): Promise<{ account: Account; mustChange: boolean }>;
  /** Новый пароль вместо временного; снимает пометку «сменить пароль». */
  changePassword(password: string): Promise<void>;
  /** Открыта ли регистрация (переключатели в «Пользователях», №79, №83). */
  signupOpen(): Promise<{ teacher: boolean; student: boolean }>;
  /** Упрощённая регистрация ученика функцией на сервере (№83); после неё — обычный вход по нику. */
  signUpStudent(s: StudentSignup): Promise<void>;
}

export interface StudentSignup {
  nickname: string;
  password: string;
  grade: number;
  consent: boolean;
  website: string; // поле-ловушка: человек его не видит и не заполняет
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
  const s = t.signup.err; // коды ответа функции student-signup
  if (m === "nick_taken") return s.nickTaken;
  if (m === "bad_nickname") return s.badNick;
  if (m === "weak_password") return s.weak;
  if (m === "bad_grade") return s.grade;
  if (m === "no_consent") return s.consent;
  if (m === "rate_limited") return s.rate;
  if (m === "closed") return s.closed;
  if (/Edge Function|FunctionsFetchError|FunctionsRelayError/i.test(m)) return r.noDb;
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
      // Ученик: главная открывается на его классе из аккаунта (№111), а не на том, что смотрели в этом браузере.
      if (p.role === "student") {
        const { data: grade } = await sb.rpc("my_grade");
        if (typeof grade === "number") savePrefs({ ...loadPrefs(), grade });
      }
      return { account, mustChange: p.must_change_password === true };
    },
    async changePassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      const { error: e2 } = await sb.rpc("password_changed");
      if (e2) throw e2;
    },
    async signupOpen() {
      const { data, error } = await sb.rpc("signup_open");
      if (error) throw error;
      return { teacher: data?.teacher === true, student: data?.student === true };
    },
    async signUpStudent(s) {
      const { error } = await sb.functions.invoke("student-signup", { body: s });
      if (error) {
        let code = error.message;
        try {
          const j = await (error as { context?: Response }).context?.json();
          if (j?.error) code = String(j.error);
        } catch { /* ответ не JSON */ }
        throw new Error(code);
      }
    },
  };
}
