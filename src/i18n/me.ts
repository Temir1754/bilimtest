// Тексты кабинета ученика /me на трёх языках. К ученику — на «ты», как на экране регистрации.
// Казахский перевод стоит проверить учителю-носителю языка.
import type { Lang } from "../lib/types";

const kk = {
  title: "Білімтест · Жеке кабинет",
  heading: "Жеке кабинет",
  skip: "Мазмұнға өту",
  hello: (nick: string) => `Сәлем, ${nick}!`,
  toSite: "Сайтқа өту",
  menu: "Аккаунт мәзірі",
  logout: "Шығу",
  loading: "Жүктелуде…",
  saved: "Сақталды.",
  grade: { title: "Сыныбың", lede: "Басты бетте осы сыныптың пәндері ашылады." },
  nick: {
    title: "Лақап ат", lede: "Енді осы лақап атпен кіресің. Нағыз атыңды жазба.",
    label: "Жаңа лақап ат", hint: "Латын әріптері, сандар, _ және нүкте, 3–20 таңба.", save: "Өзгерту",
  },
  password: {
    title: "Құпиясөз", current: "Қазіргі құпиясөз", next: "Жаңа құпиясөз (кемінде 8 таңба)", repeat: "Жаңа құпиясөзді қайталаңыз",
    save: "Құпиясөзді өзгерту",
  },
  del: {
    title: "Аккаунтты жою",
    lede: "Аккаунт, лақап ат және сынып біржола жойылады. Оны қайтару мүмкін емес.",
    open: "Аккаунтты жою…", password: "Растау үшін құпиясөз", confirm: "Біржола жою", cancel: "Болдырмау",
  },
  err: {
    wrongPassword: "Қазіргі құпиясөз қате.",
    weak: "Құпиясөз кемінде 8 таңбадан тұруы керек.",
    mismatch: "Құпиясөздер сәйкес емес.",
    badNick: "Лақап ат: 3–20 таңба, латын әріптері, сандар, _ және нүкте.",
    nickTaken: "Бұл лақап ат бос емес — басқасын ойлап тап.",
    network: "Интернетке қосылу жоқ. Байланысты тексеріп, қайталаңыз.",
    noDb: "Сайт дерекқорға қосылмаған. Кейінірек көріңіз.",
  },
};

export type MeText = typeof kk;

const ru: MeText = {
  title: "Білімтест · Личный кабинет",
  heading: "Личный кабинет",
  skip: "Перейти к содержимому",
  hello: (nick) => `Привет, ${nick}!`,
  toSite: "На сайт",
  menu: "Меню аккаунта",
  logout: "Выйти",
  loading: "Загрузка…",
  saved: "Сохранено.",
  grade: { title: "Твой класс", lede: "На главной откроются предметы этого класса." },
  nick: {
    title: "Ник", lede: "Входить теперь будешь с этим ником. Не пиши настоящее имя.",
    label: "Новый ник", hint: "Латинские буквы, цифры, _ и точка, 3–20 знаков.", save: "Изменить",
  },
  password: {
    title: "Пароль", current: "Текущий пароль", next: "Новый пароль (не меньше 8 знаков)", repeat: "Повтори новый пароль",
    save: "Сменить пароль",
  },
  del: {
    title: "Удалить аккаунт",
    lede: "Аккаунт, ник и класс удалятся навсегда. Вернуть их будет нельзя.",
    open: "Удалить аккаунт…", password: "Пароль для подтверждения", confirm: "Удалить навсегда", cancel: "Отмена",
  },
  err: {
    wrongPassword: "Текущий пароль неверный.",
    weak: "Пароль должен быть не короче 8 знаков.",
    mismatch: "Пароли не совпадают.",
    badNick: "Ник: 3–20 знаков, латинские буквы, цифры, _ и точка.",
    nickTaken: "Этот ник уже занят — придумай другой.",
    network: "Нет подключения к интернету. Проверь связь и повтори.",
    noDb: "Сайт не подключён к базе. Попробуй позже.",
  },
};

const en: MeText = {
  title: "Bilimtest · My account",
  heading: "My account",
  skip: "Skip to content",
  hello: (nick) => `Hi, ${nick}!`,
  toSite: "Go to site",
  menu: "Account menu",
  logout: "Log out",
  loading: "Loading…",
  saved: "Saved.",
  grade: { title: "Your grade", lede: "The home page will open the subjects of this grade." },
  nick: {
    title: "Nickname", lede: "You will log in with this nickname from now on. Don't use your real name.",
    label: "New nickname", hint: "Latin letters, digits, _ and dot, 3–20 characters.", save: "Change",
  },
  password: {
    title: "Password", current: "Current password", next: "New password (at least 8 characters)", repeat: "Repeat new password",
    save: "Change password",
  },
  del: {
    title: "Delete account",
    lede: "Your account, nickname and grade will be deleted for good. This cannot be undone.",
    open: "Delete account…", password: "Password to confirm", confirm: "Delete for good", cancel: "Cancel",
  },
  err: {
    wrongPassword: "The current password is wrong.",
    weak: "The password must be at least 8 characters.",
    mismatch: "Passwords do not match.",
    badNick: "Nickname: 3–20 characters, Latin letters, digits, _ and dot.",
    nickTaken: "This nickname is taken — think of another one.",
    network: "No internet connection. Check it and try again.",
    noDb: "The site is not connected to the database. Try later.",
  },
};

export const ME: Record<Lang, MeText> = { kk, ru, en };
