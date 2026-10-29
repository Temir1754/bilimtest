// Политика конфиденциальности (/privacy) на трёх языках. ЧЕРНОВИК — текст должен проверить юрист (DECISIONS.md №44, №83).
// Контакт администратора — CONTACT в contact.ts.
import type { Lang } from "../lib/types";
import { CONTACT } from "./contact";

export { CONTACT };

export interface PrivacyText {
  title: string;
  draft: string;
  updated: string;
  back: string;
  sections: { h: string; p: string[] }[];
}

const kk: PrivacyText = {
  title: "Құпиялылық саясаты",
  draft: "Жоба мәтін — заңгер тексеруі керек.",
  updated: "Жаңартылған күні: 2026 ж. 27 қазан",
  back: "← Тесттерге оралу",
  sections: [
    { h: "Сайт туралы", p: [
      "Білімтест — 4–11 сыныптарға арналған тегін тесттер. Қазір сайт пилоттық режимде: оны әкімшінің әріптестері мен олардың оқушылары пайдаланады.",
      "Тесттерді тіркелмей-ақ тапсыруға болады. Тіркелмеген адам туралы біз ештеңе сақтамаймыз (төменде «Тіркелусіз» бөлімін қараңыз).",
    ] },
    { h: "Қандай деректер жинаймыз", p: [
      "Мұғалім: аты, тегі, лақап аты, email, мектебі, сабақ беретін сыныптары мен пәндері. Мұғалімнің аккаунтын сайт әкімшісі ашады.",
      "Оқушы: тек лақап ат, құпиясөз (шифрланған түрде) және сынып. Аты-жөні, email, телефон, мекенжай, туған күні сұралмайды. Кейін — тест нәтижелері (қай тақырып, неше дұрыс жауап, күні).",
      "Барлық пайдаланушы: аккаунт ашылған және соңғы рет кірген уақыт.",
    ] },
    { h: "Тіркелусіз", p: [
      "Тілді, сыныпты және ең жақсы нәтижелерді сайт сіздің браузеріңізде ғана сақтайды — біз оларды көрмейміз.",
      "Жауаптардың жалпы статистикасы (қай сұраққа неше рет дұрыс жауап берілді) кімдікі екені белгісіз түрде сақталады.",
      "Спамнан қорғау үшін IP-мекенжайдың өзі емес, оның хэші (қайтарылмайтын код) 2 күнге дейін сақталады.",
    ] },
    { h: "Не үшін", p: [
      "Аккаунтқа кіру, нәтижелерді кез келген құрылғыда сақтау, мұғалімге сұрақтар қосу және кейін — мұғалімге өз оқушыларының нәтижесін көру.",
      "Деректерді сатпаймыз, жарнамаға пайдаланбаймыз және бөгде адамдарға бермейміз.",
    ] },
    { h: "Қайда сақталады", p: [
      "Дерекқор — Supabase сервисі, сервер Германияда (Франкфурт). Сайт файлдары — Vercel сервисінде.",
      "Құпиясөздер шифрланған түрде сақталады, оларды әкімші де көрмейді.",
    ] },
    { h: "Кім көреді", p: [
      "Оқушы — тек өз деректерін; басқа оқушыларды және мұғалімдердің деректерін көрмейді.",
      "Мұғалім — өз деректерін; қазір оқушылардың деректерін көрмейді. Мұғалім кабинеті пайда болғанда сынып мұғалімі өз оқушыларының нәтижелерін көреді — бұл туралы саясат алдын ала жаңартылады.",
      "Сайт әкімшісі — техникалық қолдау үшін барлық аккаунттарды көреді.",
    ] },
    { h: "16 жасқа толмағандар", p: [
      "Тіркелу кезінде оқушы өзіне 16 жас толғанын немесе ата-анасы тіркелуге келіскенін растайды.",
    ] },
    { h: "Аккаунтты жою", p: [
      "Оқушы аккаунтын жеке кабинетте өзі жоя алады. Мұғалім немесе кабинетке кіре алмаған оқушы әкімшіге жазады.",
      "Аккаунт жойылғанда профиль, сынып және нәтижелер толық өшіріледі. Мұғалім қосқан сұрақтар сайтта қалады, бірақ авторы көрсетілмейді.",
    ] },
    { h: "Байланыс", p: [`Деректер туралы сұрақтар мен аккаунтты жою: ${CONTACT}`] },
  ],
};

const ru: PrivacyText = {
  title: "Политика конфиденциальности",
  draft: "Черновик — текст должен проверить юрист.",
  updated: "Обновлено: 27 октября 2026 г.",
  back: "← Вернуться к тестам",
  sections: [
    { h: "О сайте", p: [
      "Білімтест — бесплатные тесты для 4–11 классов. Сейчас сайт работает в пилотном режиме: им пользуются коллеги администратора и их ученики.",
      "Тесты можно проходить без регистрации. О незарегистрированных посетителях мы ничего не храним (см. раздел «Без регистрации»).",
    ] },
    { h: "Какие данные мы собираем", p: [
      "Учитель: имя, фамилия, ник, email, школа, классы и предметы, которые он ведёт. Аккаунт учителя создаёт администратор сайта.",
      "Ученик: только ник, пароль (в зашифрованном виде) и класс. Имя, фамилия, email, телефон, адрес и дата рождения не запрашиваются. Позже — результаты тестов (тема, число верных ответов, дата).",
      "Все пользователи: дата создания аккаунта и последнего входа.",
    ] },
    { h: "Без регистрации", p: [
      "Язык, класс и лучшие результаты сайт хранит только в вашем браузере — мы их не видим.",
      "Общая статистика ответов (сколько раз на вопрос ответили верно) хранится без привязки к человеку.",
      "Для защиты от спама хранится не IP-адрес, а его хэш (необратимый код), до 2 дней.",
    ] },
    { h: "Зачем", p: [
      "Чтобы входить в аккаунт, сохранять результаты на любом устройстве, добавлять вопросы учителем, а позже — чтобы учитель видел результаты своих учеников.",
      "Мы не продаём данные, не используем их для рекламы и не передаём посторонним.",
    ] },
    { h: "Где хранятся", p: [
      "База данных — сервис Supabase, сервер в Германии (Франкфурт). Файлы сайта — в сервисе Vercel.",
      "Пароли хранятся в зашифрованном виде, их не видит даже администратор.",
    ] },
    { h: "Кто видит", p: [
      "Ученик — только свои данные; других учеников и данные учителей не видит.",
      "Учитель — свои данные; данные учеников сейчас не видит. Когда появится кабинет учителя, учитель класса будет видеть результаты своих учеников — политика будет обновлена заранее.",
      "Администратор сайта — все аккаунты, для технической поддержки.",
    ] },
    { h: "Если тебе нет 16 лет", p: [
      "При регистрации ученик подтверждает, что ему есть 16 лет или что родитель согласен на регистрацию.",
    ] },
    { h: "Удаление аккаунта", p: [
      "Ученик может удалить аккаунт сам в личном кабинете. Учитель или ученик, который не может войти, пишет администратору.",
      "При удалении аккаунта профиль, класс и результаты стираются полностью. Вопросы, добавленные учителем, остаются на сайте без указания автора.",
    ] },
    { h: "Контакт", p: [`Вопросы о данных и удаление аккаунта: ${CONTACT}`] },
  ],
};

const en: PrivacyText = {
  title: "Privacy policy",
  draft: "Draft — the text must be reviewed by a lawyer.",
  updated: "Updated: 27 October 2026",
  back: "← Back to tests",
  sections: [
    { h: "About the site", p: [
      "Bilimtest offers free tests for grades 4–11. The site is currently a pilot used by the administrator's colleagues and their students.",
      "You can take tests without signing up. We store nothing about visitors who are not signed up (see «Without an account»).",
    ] },
    { h: "What data we collect", p: [
      "Teacher: first and last name, nickname, email, school, the grades and subjects they teach. Teacher accounts are created by the site administrator.",
      "Student: only a nickname, a password (stored encrypted) and a grade. We don't ask for name, email, phone, address or date of birth. Later — test results (topic, number of correct answers, date).",
      "All users: when the account was created and last logged in.",
    ] },
    { h: "Without an account", p: [
      "Language, grade and best results are stored only in your browser — we can't see them.",
      "Overall answer statistics (how often a question was answered correctly) are stored without linking them to anyone.",
      "To protect against spam we keep a hash of the IP address (an irreversible code), not the address itself, for up to 2 days.",
    ] },
    { h: "Why", p: [
      "To log in, keep results on any device, let teachers add questions, and later — let teachers see their own students' results.",
      "We don't sell data, use it for advertising or share it with third parties.",
    ] },
    { h: "Where it is stored", p: [
      "The database is hosted by Supabase on a server in Germany (Frankfurt). The site files are hosted by Vercel.",
      "Passwords are stored encrypted; even the administrator can't see them.",
    ] },
    { h: "Who can see it", p: [
      "A student sees only their own data, not other students or teachers.",
      "A teacher sees their own data and currently can't see students' data. When the teacher dashboard appears, a class teacher will see their students' results — this policy will be updated beforehand.",
      "The site administrator sees all accounts for technical support.",
    ] },
    { h: "If you are under 16", p: [
      "When signing up, a student confirms that they are 16 or older, or that a parent agrees to the sign-up.",
    ] },
    { h: "Deleting your account", p: [
      "Students can delete their account themselves in their dashboard. Teachers, or students who can't log in, write to the administrator.",
      "When an account is deleted, the profile, grade and results are erased completely. Questions added by a teacher stay on the site without the author's name.",
    ] },
    { h: "Contact", p: [`Questions about your data and account deletion: ${CONTACT}`] },
  ],
};

export const PRIVACY: Record<Lang, PrivacyText> = { kk, ru, en };
