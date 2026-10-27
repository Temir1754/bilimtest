// Всё, что кабинет ученика /me делает с базой. Экран работает через MeApi, поэтому в тестах подставляется заглушка.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "../admin/form";
import type { MeText } from "../i18n/me";
import { clearAccount, loginEmail, saveAccount } from "../lib/account";

export interface Profile {
  nickname: string;
  role: Role;
  grade: number | null;
}

export interface MeApi {
  /** Кто вошёл; null — не вошёл. */
  load(): Promise<Profile | null>;
  setGrade(grade: number): Promise<void>;
  /** Новый ник; вместе с ним меняется адрес входа (функция на сервере account). */
  changeNickname(nickname: string): Promise<void>;
  /** Проверка текущего пароля перед сменой пароля и удалением: за общим школьным компьютером
   *  мог остаться чужой вход. Неверный — ошибка "wrong_password". */
  checkPassword(nickname: string, password: string): Promise<void>;
  changePassword(password: string): Promise<void>;
  deleteAccount(): Promise<void>;
  signOut(): Promise<void>;
}

/** Ответы Supabase и функции account → понятный текст. */
export function meError(e: unknown, t: MeText): string {
  const m = (e as { message?: string })?.message ?? String(e);
  const r = t.err;
  if (m === "wrong_password") return r.wrongPassword;
  if (m === "nick_taken") return r.nickTaken;
  if (m === "bad_nickname") return r.badNick;
  if (/Password should be|weak.?password/i.test(m)) return r.weak;
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return r.network;
  if (/Edge Function|FunctionsFetchError|FunctionsRelayError/i.test(m)) return r.noDb;
  return m;
}

export function supabaseMeApi(sb: SupabaseClient): MeApi {
  const check = <T>(r: { data: T; error: unknown }) => {
    if (r.error) throw r.error;
    return r.data;
  };
  return {
    async load() {
      const { data } = await sb.auth.getSession();
      const user = data.session?.user;
      if (!user) return null;
      const p = check(await sb.from("profiles").select("role, nickname").eq("id", user.id).single()) as { role: Role; nickname: string | null };
      const grade = check(await sb.rpc("my_grade")) as number | null;
      const profile = { nickname: p.nickname ?? (user.email ?? "").split("@")[0], role: p.role, grade };
      saveAccount({ name: profile.nickname, role: profile.role }); // шапка сайта видит тот же ник
      return profile;
    },
    async setGrade(grade) {
      check(await sb.rpc("set_my_grade", { p_grade: grade }));
    },
    async changeNickname(nickname) {
      const { error } = await sb.functions.invoke("account", { body: { action: "change_nickname", nickname } });
      if (error) {
        let code = error.message;
        try {
          const j = await (error as { context?: Response }).context?.json();
          if (j?.error) code = String(j.error);
        } catch { /* ответ не JSON */ }
        throw new Error(code);
      }
      // Новый адрес входа попадает во вход браузера при обновлении сессии.
      await sb.auth.refreshSession();
      saveAccount({ name: nickname, role: "student" });
    },
    async checkPassword(nickname, password) {
      const { error } = await sb.auth.signInWithPassword({ email: loginEmail(nickname), password });
      if (error) throw /Invalid login credentials/i.test(error.message) ? new Error("wrong_password") : error;
    },
    async changePassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
    },
    async deleteAccount() {
      check(await sb.rpc("delete_my_account"));
      await sb.auth.signOut({ scope: "local" }); // аккаунта уже нет — убираем вход из браузера
      clearAccount();
    },
    async signOut() {
      await sb.auth.signOut();
      clearAccount();
    },
  };
}
