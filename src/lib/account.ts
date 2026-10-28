// Кто вошёл — для шапки сайта без загрузки библиотеки входа (DECISIONS.md №71–72).
// После входа экран /login запоминает ник и роль; шапка читает их отсюда, главная страница остаётся лёгкой.
// Хранится там же, где сам вход: «Мені есте сақта» — в localStorage, иначе — до закрытия браузера.
import type { Role } from "../admin/form";

export const REMEMBER_KEY = "bt-remember";
const ME_KEY = "bt-me";

export interface Account {
  name: string; // ник, у админа без ника — начало email
  role: Role;
}

/** Адрес входа ученика: по нику (№71). Учитель и админ входят по email. */
export const loginEmail = (id: string) => {
  const v = id.trim().toLowerCase();
  return v.includes("@") ? v : `${v}@students.bilimtest.local`;
};

/** Куда ведёт «Кабинет»: ученик — /me; кабинет учителя (/teacher) — шаг 5 плана «Кіру», пока учитель работает в админке. */
export const cabinetPath = (role: Role) => (role === "student" ? "/me" : "/admin");

/** Код класса из ссылки учителя /me?join=КОД — ждёт, пока ученик войдёт (№102). */
const JOIN_KEY = "bt-join";
export function pendingJoin(): string {
  try { return localStorage.getItem(JOIN_KEY) ?? ""; } catch { return ""; }
}
export function setPendingJoin(code: string) {
  try { if (code) localStorage.setItem(JOIN_KEY, code); else localStorage.removeItem(JOIN_KEY); } catch { /* без хранилища */ }
}

/** Куда попадает вошедший: ученик — сразу к тестам (или в кабинет, если ждёт код класса), учитель и админ — в админку. */
export const afterLoginPath = (role: Role) => (role === "student" ? (pendingJoin() ? "/me" : "/") : "/admin");

const stores = () => [sessionStorage, localStorage];

export function setRemember(on: boolean) {
  try {
    if (on) localStorage.setItem(REMEMBER_KEY, "1");
    else localStorage.removeItem(REMEMBER_KEY);
  } catch { /* приватный режим */ }
}

export function loadAccount(): Account | null {
  try {
    for (const s of stores()) {
      const a = JSON.parse(s.getItem(ME_KEY) || "null") as Account | null;
      if (a?.name && a.role) return a;
    }
  } catch { /* испорченная запись или запрет хранилища */ }
  return null;
}

export function saveAccount(a: Account) {
  try {
    clearAccount();
    (localStorage.getItem(REMEMBER_KEY) === "1" ? localStorage : sessionStorage).setItem(ME_KEY, JSON.stringify(a));
  } catch { /* приватный режим */ }
}

export function clearAccount() {
  try {
    for (const s of stores()) s.removeItem(ME_KEY);
  } catch { /* приватный режим */ }
}
