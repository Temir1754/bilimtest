// Тексты экранов входа и регистрации (/login) на трёх языках. Девиз — с макета docs/design/mascot/login.png.
import type { Lang } from "../lib/types";

const kk = {
  title: "Білімтест · Кіру",
  slogan: "Білім — жарқын болашақтың кілті!",
  back: "← Тесттерге оралу",
  tabs: { login: "Кіру", signup: "Тіркелу" },
  login: {
    title: "Кіру",
    lede: "Жеке кабинетіңізге кіріңіз. Тесттерді тіркелмей-ақ тапсыруға болады.",
    id: "Email немесе лақап ат",
    password: "Құпиясөз",
    show: "Құпиясөзді көрсету",
    hide: "Құпиясөзді жасыру",
    remember: "Мені есте сақта",
    rememberHint: "Ортақ компьютерде белгілемеңіз",
    submit: "Кіру",
    busy: "Кіруде…",
    forgot: "Құпиясөзді ұмыттыңыз ба?",
  },
  reset: {
    title: "Құпиясөзді қалпына келтіру",
    lede: "Тіркелген email-ді жазыңыз — жаңа құпиясөз орнатуға сілтеме жібереміз.",
    student: "Email көрсетпеген оқушылар құпиясөзді мұғалімі арқылы қалпына келтіреді.",
    email: "Email",
    send: "Сілтемені жіберу",
    sending: "Жіберілуде…",
    sent: (e: string) => `Хат ${e} мекенжайына жіберілді. Поштаңызды, оның ішінде «Спам» папкасын тексеріңіз.`,
    back: "← Кіруге оралу",
  },
  err: {
    invalid: "Email, лақап ат немесе құпиясөз қате.",
    notConfirmed: "Email әлі расталмаған. Хаттағы сілтемені басыңыз.",
    banned: "Аккаунт бұғатталған. Әкімшіге хабарласыңыз.",
    rateLimit: "Әрекет тым көп. Бірнеше минуттан кейін қайталаңыз.",
    network: "Интернетке қосылу жоқ. Байланысты тексеріп, қайталаңыз.",
    noDb: "Сайт дерекқорға қосылмаған. Кейінірек көріңіз.",
  },
  menu: { label: "Аккаунт мәзірі", cabinet: "Кабинет", logout: "Шығу" },
};

export type AuthText = typeof kk;

const ru: AuthText = {
  title: "Білімтест · Вход",
  slogan: "Знания — ключ к светлому будущему!",
  back: "← Вернуться к тестам",
  tabs: { login: "Вход", signup: "Регистрация" },
  login: {
    title: "Вход",
    lede: "Войдите в личный кабинет. Тесты можно проходить и без регистрации.",
    id: "Email или ник",
    password: "Пароль",
    show: "Показать пароль",
    hide: "Скрыть пароль",
    remember: "Запомнить меня",
    rememberHint: "Не отмечайте на общем компьютере",
    submit: "Войти",
    busy: "Входим…",
    forgot: "Забыли пароль?",
  },
  reset: {
    title: "Восстановление пароля",
    lede: "Укажите email, с которым вы зарегистрированы, — пришлём ссылку для нового пароля.",
    student: "Ученики без email восстанавливают пароль через своего учителя.",
    email: "Email",
    send: "Отправить ссылку",
    sending: "Отправляем…",
    sent: (e) => `Письмо отправлено на ${e}. Проверьте почту, в том числе папку «Спам».`,
    back: "← Вернуться ко входу",
  },
  err: {
    invalid: "Неверный email, ник или пароль.",
    notConfirmed: "Email ещё не подтверждён. Нажмите ссылку в письме.",
    banned: "Аккаунт заблокирован. Обратитесь к администратору.",
    rateLimit: "Слишком много попыток. Повторите через несколько минут.",
    network: "Нет подключения к интернету. Проверьте связь и повторите.",
    noDb: "Сайт не подключён к базе. Попробуйте позже.",
  },
  menu: { label: "Меню аккаунта", cabinet: "Кабинет", logout: "Выйти" },
};

const en: AuthText = {
  title: "Bilimtest · Log in",
  slogan: "Knowledge is the key to a bright future!",
  back: "← Back to tests",
  tabs: { login: "Log in", signup: "Sign up" },
  login: {
    title: "Log in",
    lede: "Log in to your account. You can take tests without signing up.",
    id: "Email or nickname",
    password: "Password",
    show: "Show password",
    hide: "Hide password",
    remember: "Remember me",
    rememberHint: "Don't tick on a shared computer",
    submit: "Log in",
    busy: "Logging in…",
    forgot: "Forgot your password?",
  },
  reset: {
    title: "Reset password",
    lede: "Enter the email you signed up with — we'll send you a link to set a new password.",
    student: "Students without an email reset their password through their teacher.",
    email: "Email",
    send: "Send link",
    sending: "Sending…",
    sent: (e) => `We sent an email to ${e}. Check your inbox and the Spam folder.`,
    back: "← Back to log in",
  },
  err: {
    invalid: "Wrong email, nickname or password.",
    notConfirmed: "Your email isn't confirmed yet. Click the link in the email.",
    banned: "This account is blocked. Please contact the administrator.",
    rateLimit: "Too many attempts. Try again in a few minutes.",
    network: "No internet connection. Check it and try again.",
    noDb: "The site isn't connected to the database. Try again later.",
  },
  menu: { label: "Account menu", cabinet: "Dashboard", logout: "Log out" },
};

export const AUTH: Record<Lang, AuthText> = { kk, ru, en };
