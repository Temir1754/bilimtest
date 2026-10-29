import type { Lang } from "../lib/types";

// Тексты новой главной для гостя (№120): первый экран, пример задания, «Как это работает», учителям, частые вопросы.
// Только то, что сайт уже умеет; переводы вопросов на RU/EN — ещё в работе, об этом честно в ответах.
export interface HomeText {
  kicker: string;
  h1a: string;
  h1b: string;
  lede: string;
  toCatalog: string;
  teacher: string;
  noSignup: string;
  instant: string;
  facts: { grades: string; subjects: string; qs: string };
  demo: {
    tag: string; mark: string; q: string; right: string; wrong: string; expl: string; again: string;
  };
  catalog: string;
  how: { h: string; steps: [string, string][] };
  teachers: { h: string; lede: string; items: [string, string][]; login: string; access: string; mail: string };
  faq: { h: string; items: [string, string][] };
}

const kk: HomeText = {
  kicker: "4–11 сыныптарға арналған тегін тесттер",
  h1a: "Тест тапсыр.",
  h1b: "Қатеңнен үйрен.",
  lede: "Сыныбыңды, пәніңді және тақырыпты таңда. Әр жауаптан кейін дұрысын көресің, ал қате жауап берген сұрақтар келесі жолы қайта шығады.",
  toCatalog: "Тест таңдау",
  teacher: "Мен мұғаліммін",
  noSignup: "Тіркелмей-ақ бастауға болады",
  instant: "Нәтиже бірден",
  facts: { grades: "сынып", subjects: "пән", qs: "сұрақ" },
  demo: {
    tag: "Математика · 6-сынып", mark: "Мысал", q: "Бөлшектерді қос. Не шығады?",
    right: "Дұрыс!", wrong: "Қате. Дұрыс жауап — 1.",
    expl: "Бөлімдері бірдей, сондықтан алымдарын қосамыз: (3 + 1) / 4 = 4/4 = 1.", again: "Тағы бір рет",
  },
  catalog: "Тест таңда",
  how: {
    h: "Қалай жұмыс істейді",
    steps: [
      ["Тақырыпты таңда", "Сыныбыңды, пәнді және тақырыпты таңда. Бір тестте — 10 сұрақ."],
      ["Тест тапсыр", "Әр жауаптан кейін дұрыс па, қате ме — бірден көресің, дұрыс жауап та көрсетіледі."],
      ["Қатемен жұмыс жаса", "Қате жауап берген сұрақтар келесі тестте бірінші шығады. Тақырыптың қаншасын меңгергенің көрініп тұрады."],
    ],
  },
  teachers: {
    h: "Мұғалімдерге",
    lede: "Тегін кабинет: сұрақтарыңызды қосып, сыныпқа тапсырма беріңіз — кім нені түсінбегенін сайт өзі көрсетеді.",
    items: [
      ["Сұрақтар", "Қолмен немесе Word пен Excel файлынан жүктеу. Сақтамас бұрын сайт қателерді көрсетеді."],
      ["Сынып", "Сынып коды мен QR-коды бар жадынама — оқушылар өздері қосылады."],
      ["Тапсырма", "Тақырып пен мерзімді таңдайсыз, тексерудің керегі жоқ."],
      ["Есеп", "«Оқушылар × тақырыптар» кестесі, әр оқушының беті, Excel-ге жүктеу."],
      ["Сертификат", "50, 100, 250 және одан көп жарияланған сұрақ үшін автор сертификаты."],
    ],
    login: "Кабинетке кіру",
    access: "Мұғалім аккаунтын әзірге сайт әкімшісі ашады. Жазыңыз:",
    mail: "Білімтест: мұғалім аккаунты",
  },
  faq: {
    h: "Жиі қойылатын сұрақтар",
    items: [
      ["Тіркелу керек пе?", "Жоқ. Тест тапсыру үшін тіркелудің керегі жоқ — нәтижелер осы құрылғыда сақталады. Тіркелсең, нәтижелер аккаунтыңда сақталады және мұғалімнің сыныбына қосыла аласың."],
      ["Тегін бе?", "Иә, тесттер мен мұғалім кабинеті тегін."],
      ["Сұрақтар қай тілде?", "Сайт қазақ, орыс және ағылшын тілдерінде. Сұрақтардың көбі әзірге қазақша, орысша мен ағылшынша аудармасы қосылып жатыр. Тілдік пәндердің тесттері — сол тілде."],
      ["Сұрақтан қате тапсам ше?", "Жауап бергеннен кейін «Қате бар ма? Хабарла» деп жаз. Бірнеше адам хабарласа, сұрақ тексеруге жіберіледі."],
      ["Сұрақтарды кім жазады?", "Мұғалімдер. Жарияланған сұрақты бәрі көреді, жобаны тек авторы мен әкімші көреді."],
      ["Мұғалім өз сұрақтарын қалай қосады?", "Кабинетте қолмен немесе Word, Excel файлынан. Нұсқаулық кабинеттің ішінде бар."],
    ],
  },
};

const ru: HomeText = {
  kicker: "Бесплатные тесты для 4–11 классов",
  h1a: "Пройди тест.",
  h1b: "Учись на ошибках.",
  lede: "Выбери класс, предмет и тему. После каждого ответа видно правильный, а вопросы, где ты ошибся, вернутся в следующий раз.",
  toCatalog: "Выбрать тест",
  teacher: "Я учитель",
  noSignup: "Можно начать без регистрации",
  instant: "Результат сразу",
  facts: { grades: "классы", subjects: "предметов", qs: "вопросов" },
  demo: {
    tag: "Математика · 6 класс", mark: "Пример", q: "Сложи дроби. Что получится?",
    right: "Верно!", wrong: "Неверно. Правильный ответ — 1.",
    expl: "Знаменатели одинаковые, поэтому складываем числители: (3 + 1) / 4 = 4/4 = 1.", again: "Ещё раз",
  },
  catalog: "Выбери тест",
  how: {
    h: "Как это работает",
    steps: [
      ["Выбери тему", "Класс, предмет и тема. В одном тесте — 10 вопросов."],
      ["Пройди тест", "После каждого ответа сразу видно, верно или нет, и какой ответ правильный."],
      ["Работай над ошибками", "Вопросы с ошибками в следующем тесте идут первыми. Видно, сколько в теме уже выучено."],
    ],
  },
  teachers: {
    h: "Учителям",
    lede: "Бесплатный кабинет: добавьте свои вопросы и дайте классу задание — сайт сам покажет, кто что не понял.",
    items: [
      ["Вопросы", "Вручную или из файла Word и Excel. До сохранения сайт показывает ошибки."],
      ["Класс", "Памятка с кодом и QR-кодом класса — ученики подключаются сами."],
      ["Задание", "Выбираете тему и срок, проверять ничего не нужно."],
      ["Отчёт", "Таблица «ученики × темы», страница каждого ученика, выгрузка в Excel."],
      ["Сертификат", "Сертификат автора за 50, 100, 250 и больше опубликованных вопросов."],
    ],
    login: "Войти в кабинет",
    access: "Аккаунт учителя пока открывает администратор сайта. Напишите:",
    mail: "Білімтест: аккаунт учителя",
  },
  faq: {
    h: "Частые вопросы",
    items: [
      ["Нужна ли регистрация?", "Нет. Тесты можно проходить без регистрации — результаты сохраняются на этом устройстве. С аккаунтом результаты сохраняются в нём, и можно вступить в класс учителя."],
      ["Это бесплатно?", "Да, тесты и кабинет учителя бесплатны."],
      ["На каком языке вопросы?", "Сайт работает на казахском, русском и английском. Большинство вопросов пока на казахском, перевод на русский и английский добавляется. Тесты по языковым предметам — на языке предмета."],
      ["Нашёл ошибку в вопросе — что делать?", "После ответа нажми «Нашёл ошибку? Сообщи». Если сообщат несколько человек, вопрос уйдёт на проверку."],
      ["Кто пишет вопросы?", "Учителя. Опубликованный вопрос видят все, черновик — только автор и администратор."],
      ["Как учителю добавить свои вопросы?", "В кабинете — вручную или из файла Word и Excel. Инструкция есть в самом кабинете."],
    ],
  },
};

const en: HomeText = {
  kicker: "Free tests for grades 4–11",
  h1a: "Take the test.",
  h1b: "Learn from mistakes.",
  lede: "Pick your grade, subject and topic. After each answer you see the right one, and the questions you missed come back next time.",
  toCatalog: "Find a test",
  teacher: "I'm a teacher",
  noSignup: "No sign-up needed to start",
  instant: "Instant result",
  facts: { grades: "grades", subjects: "subjects", qs: "questions" },
  demo: {
    tag: "Mathematics · Grade 6", mark: "Example", q: "Add the fractions. What do you get?",
    right: "Correct!", wrong: "Wrong. The correct answer is 1.",
    expl: "The denominators are equal, so add the numerators: (3 + 1) / 4 = 4/4 = 1.", again: "Try again",
  },
  catalog: "Pick a test",
  how: {
    h: "How it works",
    steps: [
      ["Pick a topic", "Grade, subject and topic. Each test has 10 questions."],
      ["Take the test", "After each answer you instantly see whether you were right, and the correct answer."],
      ["Work on mistakes", "Questions you missed come first in the next test. You can see how much of the topic you have learned."],
    ],
  },
  teachers: {
    h: "For teachers",
    lede: "A free dashboard: add your questions and give your class an assignment — the site shows who did not understand what.",
    items: [
      ["Questions", "By hand or from a Word or Excel file. The site shows errors before saving."],
      ["Class", "A handout with the class code and QR code — students join on their own."],
      ["Assignment", "Choose a topic and a due date; nothing to grade."],
      ["Report", "A “students × topics” table, a page for each student, export to Excel."],
      ["Certificate", "An author certificate for 50, 100, 250 or more published questions."],
    ],
    login: "Log in to the dashboard",
    access: "For now, teacher accounts are opened by the site administrator. Write to:",
    mail: "Bilimtest: teacher account",
  },
  faq: {
    h: "Questions and answers",
    items: [
      ["Do I need to sign up?", "No. You can take tests without an account — results are saved on this device. With an account, results are saved to it and you can join your teacher's class."],
      ["Is it free?", "Yes, the tests and the teacher dashboard are free."],
      ["What language are the questions in?", "The site works in Kazakh, Russian and English. Most questions are in Kazakh for now; Russian and English translations are being added. Language subjects are tested in that language."],
      ["I found a mistake in a question. What now?", "After answering, tap “Found a mistake? Report it”. If several people report it, the question goes back for review."],
      ["Who writes the questions?", "Teachers. Published questions are visible to everyone; drafts only to the author and the administrator."],
      ["How does a teacher add questions?", "In the dashboard — by hand or from a Word or Excel file. The guide is inside the dashboard."],
    ],
  },
};

export const HOME: Record<Lang, HomeText> = { kk, ru, en };
