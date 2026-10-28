// Памятка для учеников класса (DECISIONS.md №116): печать и WhatsApp. Названия кнопок — как на сайте ученика
// (auth.ts — «Тіркелу», «Оқушы»; me.ts — «Сыныпқа қосылу», «Тапсырмаларым»): поменяли там — поправьте здесь.
import type { Lang } from "../lib/types";

export interface MemoInput {
  subject: string;
  grade: number;
  letter: string;
  code: string;
  link: string; // сайт/me?join=КОД
}

export interface MemoText {
  title: string;
  scan: string;
  steps: string[];
  codeLabel: string;
  save: string;
  nick: string;
  password: string;
}

const cls = (lang: Lang, g: number, l: string) =>
  lang === "en" ? `Grade ${g}${l ? " " + l : ""}` : `${g}${l ? " " + l : ""} ${lang === "kk" ? "сынып" : "класс"}`;

export function memoText(lang: Lang, m: MemoInput): MemoText {
  const c = cls(lang, m.grade, m.letter);
  if (lang === "ru") return {
    title: `${m.subject} · ${c} — Білімтест`,
    scan: "Наведи камеру телефона на QR-код или открой ссылку:",
    steps: [
      `Открой ссылку: ${m.link}`,
      "Нажми «Регистрация» → «Ученик»: придумай ник (не пиши настоящее имя), пароль и выбери свой класс. Уже есть аккаунт — «Вход».",
      `Нажми «Войти в класс». Код подставится сам; если нет — впиши код ${m.code}. В поле «Имя» напиши имя и первую букву фамилии, чтобы учитель тебя узнал.`,
      "Задания учителя: «Кабинет» → «Мои задания» → «Начать».",
    ],
    codeLabel: "Код класса", save: "Запиши, чтобы не забыть:", nick: "Ник", password: "Пароль",
  };
  if (lang === "en") return {
    title: `${m.subject} · ${c} — Bilimtest`,
    scan: "Point your phone camera at the QR code or open the link:",
    steps: [
      `Open the link: ${m.link}`,
      "Press “Sign up” → “Student”: think of a nickname (not your real name), a password, and choose your grade. Already have an account? “Log in”.",
      `Press “Join the class”. The code is filled in for you; if not, type ${m.code}. In the “Your name” field write your first name and the first letter of your surname so your teacher knows you.`,
      "Your teacher's tasks are in “Dashboard” → “My tasks” → “Start”.",
    ],
    codeLabel: "Class code", save: "Write it down so you don't forget:", nick: "Nickname", password: "Password",
  };
  return {
    title: `${m.subject} · ${c} — Білімтест`,
    scan: "Телефон камерасын QR-кодқа бағытта немесе сілтемені аш:",
    steps: [
      `Сілтемені аш: ${m.link}`,
      "«Тіркелу» → «Оқушы»: лақап ат ойлап тап (нағыз атыңды жазба), құпиясөз және сыныбыңды таңда. Аккаунтың болса — «Кіру».",
      `«Сыныпқа қосылу» батырмасын бас. Код өзі жазылады; жазылмаса — ${m.code} кодын жаз. «Атың» жолына атың мен тегіңнің бірінші әрпін жаз — мұғалім сені тануы үшін.`,
      "Мұғалімнің тапсырмалары — «Кабинет» → «Тапсырмаларым» → «Бастау».",
    ],
    codeLabel: "Сынып коды", save: "Ұмытпау үшін жазып қой:", nick: "Лақап ат", password: "Құпиясөз",
  };
}

/** Текст для WhatsApp: те же шаги, без QR-кода и строк для записи. */
export function memoMessage(lang: Lang, m: MemoInput): string {
  const x = memoText(lang, m);
  return [`*${x.title}*`, `${x.codeLabel}: *${m.code}*`, "", ...x.steps.map((s, i) => `${i + 1}. ${s}`)].join("\n");
}
