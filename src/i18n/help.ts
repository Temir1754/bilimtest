// Инструкция для учителя «Нұсқаулық» (/admin/help, DECISIONS.md №114). Названия кнопок — как в админке (admin.ts):
// поменяли кнопку там — поправьте и здесь. min — сколько опубликованных вопросов нужно теме (настройка).
import type { Lang } from "../lib/types";

/** Абзац, нумерованные шаги или ссылка на образец Word. */
export type HelpBlock = string | { steps: string[] } | { sample: string };

export interface HelpArticle {
  id: "add" | "file" | "status" | "translate" | "class" | "task" | "cert" | "faq";
  title: string;
  body: HelpBlock[];
}

export interface HelpText {
  title: string;
  lede: string;
  contents: string;
  top: string;
  articles: HelpArticle[];
}

const kk = (min: number): HelpText => ({
  title: "Нұсқаулық",
  lede: "Сайтпен жұмыс қысқаша: сұрақ қосу, файлдан жүктеу, сынып, тапсырма және есептер.",
  contents: "Мазмұны", top: "↑ Жоғары",
  articles: [
    { id: "add", title: "Сұрақты қолмен қосу", body: [
      { steps: [
        "«Сұрақтар» → сынып → пән.",
        "Тақырыпты тауып, «+ Сұрақ қосу» басыңыз. Тақырып жоқ болса — бөлімнің астындағы «+ тақырып».",
        "Сұрақ мәтінін және 3–4 жауапты жазыңыз, дұрыс жауапты белгілеңіз.",
        "«Сақтау және келесі сұрақ» — сұрақ сақталады, келесісін бірден жаза бересіз.",
      ] },
      "«Қосымша» ішінде: түсіндірме (оқушы қате жауап бергенде көреді), сурет (2 МБ-қа дейін), күрделілік, орыс және ағылшын мәтіні.",
      "Формула: жол ішінде — \\( x^2 \\), бөлек жолда — \\[ \\frac{a}{b} \\]. «Оқушы көзімен алдын ала қарау» формуланың қалай көрінетінін көрсетеді.",
    ] },
    { id: "file", title: "Тестті файлдан жүктеу (Word, Excel)", body: [
      "Дайын тестіңіз Word немесе Excel файлында болса, оны қайта терудің қажеті жоқ.",
      { steps: [
        "«Сұрақтар» → сынып → пән → «Файл ▾» → «Файлдан жүктеу (Excel, Word)».",
        "Файлды таңдаңыз. Бағдарлама әр сұрақты кестеде көрсетеді: тақырып, сұрақ, жауаптар, дұрыс жауап.",
        "Қызыл жолдарды түзетіңіз — оларды кестенің ішінде өзгертуге болады. Қатесі бар жол жүктелмейді.",
        "Тақырыптарды тексеріңіз: файлдағы тақырып бағдарламада табылмаса, «+ Жаңа тақырып» құрылады.",
        "«… сұрақты жобаларға жүктеу» батырмасын басыңыз (сенімді мұғалімде — «… жүктеп, жариялау»).",
      ] },
      "Word пішімі: «§1. Тақырып атауы», сұрақ — қалың әріппен «1. Сұрақ», астында 3–4 жауап, файлдың соңында кілт: «$1 1A. 2D. 3B.» Үлгіні жүктеп алып, сол сияқты жазыңыз:",
      { sample: "Word үлгісін жүктеп алу (.docx)" },
      "Excel: «Файлдан жүктеу» бетінде «Үлгіні жүктеп алу» — бір жол, бір сұрақ. Өз Excel файлыңыз да жарайды: бағдарлама қай баған не екенін сұрайды.",
      "Жиі қате: сұрақта 5 жауап (біреуін өшіріңіз); сұрақ нөмірі сәйкес емес — кестеде «нөмірлеу бұзылған» деп белгіленеді, дұрыс жауапты басып растаңыз.",
    ] },
    { id: "status", title: "Оқушы сұрақты қашан көреді", body: [
      "Сұрақтың үш күйі бар: «Жоба» → «Тексеруде» → «Жарияланған». Оқушылар тек жарияланған сұрақты көреді.",
      "Жоба дайын болғанда «Тексеруге жіберу» басыңыз — әкімші тексеріп, жариялайды немесе себебін жазып қайтарады. Қайтарылған сұрақтар «Менің сұрақтарым» бөлімінде ең жоғарыда, себебімен бірге тұрады.",
      "Сенімді мұғалім сұрақтарын өзі жариялайды, тексеру керек емес.",
      `Тақырып сайтта тақырыпта кемінде ${min} жарияланған сұрақ болғанда ғана көрінеді. Тақырыптар бетіндегі «3 / ${min}» белгісі қанша сұрақ бар екенін көрсетеді.`,
      "Оқушылар қате туралы хабарлай алады. Үш түрлі адам хабарласа, сұрақ сайттан өзі жасырылып, «Тексеруде» күйіне өтеді — «Менің сұрақтарым» ішінде оқушылардың жазғанын көресіз. Түзетіп, қайта жіберіңіз.",
    ] },
    { id: "translate", title: "Орыс және ағылшын тілі", body: [
      "Сұрақ тек мәтіні мен барлық жауабы толық жазылған тілде көрінеді. Тек қазақша жазсаңыз, сұрақ сайттың қазақ тіліндегі бетінде ғана болады.",
      "Аудару үшін: «Сұрақтар» → «Аударма керек» — RU немесе EN мәтіні жоқ сұрақтардың тізімі. «Орыс тіліндегі мәтінді көшіру» батырмасы мәтінді бір тілден екіншісіне көшіреді.",
    ] },
    { id: "class", title: "Сынып және оқушылар", body: [
      { steps: [
        "«Сыныптарым» → пән, сынып және әрпі → «Сынып құру».",
        "Сыныптың 6 таңбалы коды мен сілтемесі шығады. Сілтемені сыныптың WhatsApp-тобына жіберіңіз.",
        "Оқушы сайтта лақап атпен тіркеліп, сілтемені ашады немесе «Кабинет» → «Сыныпқа қосылу» бөліміне кодты жазады.",
      ] },
      "Оқушының осы пән бойынша барлық тесті сыныптың есебіне түседі — тапсырма болмаса да.",
      "«Шығару» — оқушыны сыныптан алып тастайды, оның осы пән бойынша нәтижелері өшеді. «Сыныпты жою» — оқушылардың аккаунттары қалады.",
    ] },
    { id: "task", title: "Тапсырма және есептер", body: [
      { steps: [
        "Сынып бетінде «Тапсырмалар»: тақырып пен мерзімді таңдаңыз (әдетте — жақын жұма) → «Тапсырма беру».",
        "Оқушы тапсырманы «Кабинет» → «Тапсырмаларым» ішінде көреді. Мерзім соңғы күні 23:59-ға дейін.",
        "Оқушы тақырып бойынша тест тапсырса — тапсырма орындалды. Бірнеше рет тапсырса, ең жақсы нәтиже есептеледі.",
      ] },
      `Тақырыпта ${min}-ден аз сұрақ болса, ол оқушыларға әлі жабық — оған тапсырма беруге болмайды.`,
      "«Оқушылар × тақырыптар» — кім нені түсінбегенін көрсетеді (соңғы 20 жауап): жасыл — 80% және жоғары, сары — 50–79%, қызыл — 50%-дан төмен, «·» — жауап аз. Оқушының атын бассаңыз — оның беті: апталар бойынша, қате жауап берген сұрақтары.",
      "«Excel-ге түсіру» — сынып есебі файлмен (педкеңес пен есепке).",
    ] },
    { id: "cert", title: "Автор сертификаты", body: [
      "50, 100, 250, 500 және 1000 жарияланған сұраққа сертификат беріледі. Ол «Менің сұрақтарым» бөлімінде шығады: «… сұраққа сертификат алу».",
      "Сертификаттың өз мекенжайы бар — кез келген адам оның шын екенін тексере алады. PDF ету үшін сертификат бетінде «Басып шығару / PDF сақтау».",
      "Сертификатта аты-жөніңіз жазылады. Профильде аты жоқ болса — әкімшіге жазыңыз.",
    ] },
    { id: "faq", title: "Жиі қойылатын сұрақтар", body: [
      `Оқушы менің тақырыбымды көрмейді. — Тақырыпта кемінде ${min} жарияланған сұрақ бар ма және оқушы дұрыс сыныпты ашты ма, тексеріңіз.`,
      "Жарияланған сұрақта қате таптым. — Жарияланған сұрақты әкімші өзгертеді (сенімді мұғалім — өз сұрағын өзі). Әкімшіге жазыңыз.",
      "Оқушы құпиясөзін ұмытты. — Сынып бетінде оқушының қатарында «Құпиясөз» басыңыз: уақытша құпиясөз шығады. Оқушы сонымен кіріп, жаңасын ойлап табады.",
      "Файл жүктелмейді. — Word-та «Басқаша сақтау» → .docx, Excel-де → .xlsx етіп сақтап, қайта көріңіз. Кестедегі қызыл жолдарды түзетіңіз.",
    ] },
  ],
});

const ru = (min: number): HelpText => ({
  title: "Инструкция",
  lede: "Коротко о работе с сайтом: вопросы, загрузка из файла, класс, задания и отчёты.",
  contents: "Содержание", top: "↑ Наверх",
  articles: [
    { id: "add", title: "Добавить вопрос вручную", body: [
      { steps: [
        "«Вопросы» → класс → предмет.",
        "Найдите тему и нажмите «+ Добавить вопрос». Нужной темы нет — «+ тема» под разделом.",
        "Напишите вопрос и 3–4 ответа, отметьте правильный.",
        "«Сохранить и следующий вопрос» — вопрос сохранён, сразу пишете следующий.",
      ] },
      "В «Дополнительно»: пояснение (ученик видит, если ответил неверно), картинка (до 2 МБ), сложность, текст на казахском и английском.",
      "Формула: в строке — \\( x^2 \\), отдельной строкой — \\[ \\frac{a}{b} \\]. «Предпросмотр глазами ученика» покажет, как она выглядит.",
    ] },
    { id: "file", title: "Загрузить тест из файла (Word, Excel)", body: [
      "Если тест уже есть в Word или Excel, перепечатывать его не нужно.",
      { steps: [
        "«Вопросы» → класс → предмет → «Файл ▾» → «Загрузить из файла (Excel, Word)».",
        "Выберите файл. Программа покажет каждый вопрос в таблице: тема, вопрос, ответы, правильный ответ.",
        "Исправьте красные строки — прямо в таблице. Строка с ошибкой не загружается.",
        "Проверьте темы: если тема из файла не нашлась в программе, создаётся «+ Новая тема».",
        "Нажмите «Загрузить … в черновики» (у доверенного учителя — «Загрузить … и опубликовать»).",
      ] },
      "Формат Word: «§1. Название темы», вопрос — жирным «1. Вопрос», под ним 3–4 ответа, в конце файла ключ: «$1 1A. 2D. 3B.» Скачайте образец и пишите так же:",
      { sample: "Скачать образец Word (.docx)" },
      "Excel: на странице загрузки «Скачать шаблон» — одна строка, один вопрос. Подойдёт и ваш собственный Excel: программа спросит, какой столбец что значит.",
      "Частые ошибки: у вопроса 5 ответов (удалите один); номер вопроса не по порядку — строка помечена «нумерация сбита», подтвердите правильный ответ щелчком.",
    ] },
    { id: "status", title: "Когда ученик видит вопрос", body: [
      "У вопроса три статуса: «Черновик» → «На проверке» → «Опубликован». Ученики видят только опубликованные.",
      "Когда черновик готов, нажмите «Отправить на проверку» — админ проверит и опубликует или вернёт с причиной. Возвращённые вопросы — в «Моих вопросах» в самом верху, с причиной.",
      "Доверенный учитель публикует свои вопросы сам, без проверки.",
      `Тема появляется на сайте, когда в ней не меньше ${min} опубликованных вопросов. Значок «3 / ${min}» на странице тем показывает, сколько уже есть.`,
      "Ученики могут сообщить об ошибке. Если сообщили трое разных людей, вопрос сам скрывается с сайта и переходит в «На проверке» — в «Моих вопросах» видно, что написали ученики. Исправьте и отправьте снова.",
    ] },
    { id: "translate", title: "Русский и английский", body: [
      "Вопрос показывается только на тех языках, где полностью заполнены текст и все ответы. Написали только по-казахски — вопрос будет только на казахской версии сайта.",
      "Для перевода: «Вопросы» → «Нужен перевод» — список вопросов без RU или EN. Кнопка «Скопировать текст из русского» переносит текст с одного языка на другой.",
    ] },
    { id: "class", title: "Класс и ученики", body: [
      { steps: [
        "«Мои классы» → предмет, класс и буква → «Создать класс».",
        "Появятся код класса из 6 знаков и ссылка. Отправьте ссылку в WhatsApp-группу класса.",
        "Ученик регистрируется на сайте по нику и открывает ссылку или вводит код в «Кабинете» → «Войти в класс».",
      ] },
      "Все тесты ученика по этому предмету попадают в отчёт класса — даже без задания.",
      "«Убрать» — ученик выходит из класса, его результаты по предмету удаляются. «Удалить класс» — аккаунты учеников остаются.",
    ] },
    { id: "task", title: "Задания и отчёты", body: [
      { steps: [
        "На странице класса в «Задания»: выберите тему и срок (по умолчанию — ближайшая пятница) → «Дать задание».",
        "Ученик видит задание в «Кабинете» → «Мои задания». Срок — до 23:59 последнего дня.",
        "Ученик прошёл тест по теме — задание выполнено. Если проходил несколько раз, засчитывается лучший результат.",
      ] },
      `Тема, где меньше ${min} вопросов, ещё закрыта для учеников — задание по ней дать нельзя.`,
      "«Ученики × темы» показывает, кто что не понял (последние 20 ответов): зелёный — 80% и выше, жёлтый — 50–79%, красный — ниже 50%, «·» — мало ответов. Нажмите на имя ученика — его страница: по неделям, вопросы с ошибками.",
      "«Выгрузить в Excel» — отчёт класса файлом (для педсовета и отчётности).",
    ] },
    { id: "cert", title: "Сертификат автора", body: [
      "Сертификат выдаётся за 50, 100, 250, 500 и 1000 опубликованных вопросов. Он появляется в «Моих вопросах»: «Получить сертификат за … вопросов».",
      "У сертификата свой адрес — любой может проверить, что он настоящий. Чтобы получить PDF, на странице сертификата «Печать / сохранить в PDF».",
      "В сертификате пишутся имя и фамилия. Если их нет в профиле — напишите админу.",
    ] },
    { id: "faq", title: "Частые вопросы", body: [
      `Ученик не видит мою тему. — Проверьте, что в теме не меньше ${min} опубликованных вопросов и что ученик открыл нужный класс.`,
      "Нашёл ошибку в опубликованном вопросе. — Опубликованный вопрос меняет админ (доверенный учитель — свой вопрос сам). Напишите админу.",
      "Ученик забыл пароль. — На странице класса в строке ученика нажмите «Пароль»: появится временный пароль. Ученик входит с ним и придумывает новый.",
      "Файл не загружается. — Сохраните его в Word через «Сохранить как» → .docx, в Excel → .xlsx и попробуйте снова. Исправьте красные строки в таблице.",
    ] },
  ],
});

const en = (min: number): HelpText => ({
  title: "Guide",
  lede: "A short guide to the site: questions, uploading from a file, classes, tasks and reports.",
  contents: "Contents", top: "↑ Top",
  articles: [
    { id: "add", title: "Add a question by hand", body: [
      { steps: [
        "“Questions” → grade → subject.",
        "Find the topic and press “+ Add question”. No such topic? Use “+ topic” under the section.",
        "Write the question and 3–4 answers, mark the correct one.",
        "“Save and next question” saves it, and you can write the next one right away.",
      ] },
      "Under “More”: an explanation (students see it after a wrong answer), an image (up to 2 MB), difficulty, Kazakh and Russian text.",
      "Formulas: inline — \\( x^2 \\), on a separate line — \\[ \\frac{a}{b} \\]. “Preview as a student” shows how it looks.",
    ] },
    { id: "file", title: "Upload a test from a file (Word, Excel)", body: [
      "If your test is already in Word or Excel, you don't need to retype it.",
      { steps: [
        "“Questions” → grade → subject → “File ▾” → “Import from a file (Excel, Word)”.",
        "Choose the file. Every question is shown in a table: topic, question, answers, correct answer.",
        "Fix the red rows right in the table. Rows with errors are not uploaded.",
        "Check the topics: if a topic from the file is not in the curriculum, a “+ New topic” is created.",
        "Press “Import … as drafts” (a trusted teacher: “Import … and publish”).",
      ] },
      "Word format: “§1. Topic name”, a question in bold “1. Question”, 3–4 answers below it, and the key at the end of the file: “$1 1A. 2D. 3B.” Download the sample and write the same way:",
      { sample: "Download the Word sample (.docx)" },
      "Excel: on the upload page, “Download template” — one row, one question. Your own Excel file works too: you will be asked which column is which.",
      "Common errors: a question has 5 answers (delete one); question numbers out of order — the row is marked “numbering is off”, confirm the correct answer with a click.",
    ] },
    { id: "status", title: "When students see a question", body: [
      "A question has three statuses: “Draft” → “In review” → “Published”. Students see only published questions.",
      "When a draft is ready, press “Send for review”: the admin publishes it or sends it back with a reason. Returned questions are at the top of “My questions”, with the reason.",
      "A trusted teacher publishes their own questions without review.",
      `A topic appears on the site once it has at least ${min} published questions. The “3 / ${min}” badge on the topics page shows how many there are.`,
      "Students can report a mistake. If three different people report it, the question is hidden from the site and goes to “In review” — you see what the students wrote in “My questions”. Fix it and send it again.",
    ] },
    { id: "translate", title: "Russian and English", body: [
      "A question is shown only in the languages where the text and all answers are filled in. If you write only in Kazakh, the question is only on the Kazakh version of the site.",
      "To translate: “Questions” → “Needs translation” — a list of questions without RU or EN. The “Copy text from Russian” button copies text from one language to another.",
    ] },
    { id: "class", title: "Classes and students", body: [
      { steps: [
        "“My classes” → subject, grade and letter → “Create class”.",
        "You get a 6-character class code and a link. Send the link to the class WhatsApp group.",
        "A student signs up on the site with a nickname and opens the link, or enters the code in “Dashboard” → “Join a class”.",
      ] },
      "All of a student's tests in this subject go into the class report — even without a task.",
      "“Remove” takes a student out of the class and deletes their results in this subject. “Delete class” keeps the students' accounts.",
    ] },
    { id: "task", title: "Tasks and reports", body: [
      { steps: [
        "On the class page, in “Tasks”: choose a topic and a due date (the nearest Friday by default) → “Give a task”.",
        "The student sees it in “Dashboard” → “My tasks”. It is open until 23:59 on the due date.",
        "When the student takes a test on the topic, the task is done. If they take it several times, the best result counts.",
      ] },
      `A topic with fewer than ${min} questions is still closed to students, so you can't give a task on it.`,
      "“Students × topics” shows who didn't understand what (last 20 answers): green — 80% and above, yellow — 50–79%, red — below 50%, “·” — too few answers. Click a student's name for their page: by week, questions they got wrong.",
      "“Export to Excel” — the class report as a file (for staff meetings and school reports).",
    ] },
    { id: "cert", title: "Author certificate", body: [
      "Certificates are given for 50, 100, 250, 500 and 1000 published questions. It appears in “My questions”: “Get the certificate for … questions”.",
      "Each certificate has its own address, so anyone can check that it is real. For a PDF, on the certificate page use “Print / save as PDF”.",
      "The certificate shows your first and last name. If they are not in your profile, write to the admin.",
    ] },
    { id: "faq", title: "Frequently asked questions", body: [
      `A student doesn't see my topic. — Check that the topic has at least ${min} published questions and that the student opened the right grade.`,
      "I found a mistake in a published question. — Published questions are changed by the admin (a trusted teacher changes their own). Write to the admin.",
      "A student forgot their password. — On the class page, press “Password” in the student's row: a temporary password appears. The student logs in with it and chooses a new one.",
      "The file won't upload. — Save it in Word with “Save as” → .docx, in Excel → .xlsx, and try again. Fix the red rows in the table.",
    ] },
  ],
});

export const HELP: Record<Lang, (min: number) => HelpText> = { kk, ru, en };
