// Всё, что кабинет ученика /me делает с базой. Экран работает через MeApi, поэтому в тестах подставляется заглушка.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "../admin/form";
import type { MeText } from "../i18n/me";
import { clearAccount, loginEmail, saveAccount } from "../lib/account";
import { tx } from "../lib/text";
import type { Lang } from "../lib/types";

export interface Profile {
  nickname: string;
  role: Role;
  grade: number | null;
}

/** Класс ученика (№102): предмет, класс, буква, учитель и имя ученика в классе. */
export interface MyClass {
  id: string;
  subject: string; // название предмета на языке кабинета
  grade: number;
  letter: string;
  teacher: string;
  display_name: string;
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
  /** Классы ученика; войти по коду (имя в классе — по желанию); выйти из класса. */
  classes(lang: Lang): Promise<MyClass[]>;
  joinClass(code: string, name: string): Promise<void>;
  leaveClass(id: string): Promise<void>;
  signOut(): Promise<void>;
}

/** Ответы Supabase и функции account → понятный текст. */
export function meError(e: unknown, t: MeText): string {
  const m = (e as { message?: string })?.message ?? String(e);
  const r = t.err;
  if (m === "wrong_password") return r.wrongPassword;
  if (m === "nick_taken") return r.nickTaken;
  if (m === "bad_nickname") return r.badNick;
  if (/Код класса не найден/.test(m)) return r.badCode;
  if (/Слишком много попыток/.test(m)) return r.tooMany;
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
    async classes(lang) {
      type Row = { id: string; subject_id: string; grade: number; letter: string; teacher: string; display_name: string };
      const [rows, subjects] = await Promise.all([
        sb.rpc("my_classes").then(check) as Promise<Row[]>,
        sb.from("subjects").select("id, icon, name_kk, name_ru, name_en").then(check) as Promise<{ id: string; icon: string; name_kk: string; name_ru: string; name_en: string }[]>,
      ]);
      return rows.map((r) => {
        const s = subjects.find((x) => x.id === r.subject_id);
        return { id: r.id, grade: r.grade, letter: r.letter, teacher: r.teacher, display_name: r.display_name,
          subject: s ? `${s.icon} ${tx({ kk: s.name_kk, ru: s.name_ru, en: s.name_en }, lang)}` : "" };
      });
    },
    async joinClass(code, name) {
      check(await sb.rpc("join_class", { p_code: code, p_name: name }));
    },
    async leaveClass(id) {
      check(await sb.rpc("leave_class", { p_class_id: id }));
    },
    async signOut() {
      await sb.auth.signOut();
      clearAccount();
    },
  };
}
