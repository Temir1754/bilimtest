// Отчёт владельцу за неделю (ROADMAP «Автоматизация», пункт 4; DECISIONS.md №112).
// Сбор цифр из базы — collectWeekly, текст письма — formatWeekly. Отправка — scripts/weekly-report.ts.
import type { Db } from "./importer";

export interface WeeklyTeacher {
  name: string;
  school: string;
  questions: number;
}

/** Учитель застрял (№117): зарегистрирован больше 7 дней назад, и ничего не начал или в его классах нет учеников. */
export interface WeeklyStuck {
  name: string;
  email: string;
  school: string;
  why: "nothing" | "noStudents";
  days: number; // дней с регистрации
  lastSeen: string | null; // последний вход
}

export interface WeeklyData {
  since: string;
  teachers: number;
  teachersNew: WeeklyTeacher[];
  students: number;
  studentsNew: number;
  published: number;
  questionsNew: number;
  publishedNew: number;
  drafts: number;
  review: number; // «Тексеруде»: ждут админа или автора
  hidden: { topic: string; comment: string }[]; // скрыты жалобами учеников
  reportsNew: number;
  reportsOpen: number;
  tests: number;
  testsGuests: number;
  activeStudents: number;
  classes: number;
  classesNew: number;
  assignmentsNew: number;
  topicsShown: number;
  schoolsWaiting: number;
  topTopics: { title: string; tests: number }[];
  topAuthors: { name: string; questions: number }[];
  stuck: WeeklyStuck[];
}

/** Состояние автоматических задач GitHub за неделю (передаёт weekly.yml); без него раздел не пишется. */
export interface WeeklyHealth {
  checksFailed: number;
  checksTotal: number;
  backup: string; // success / failure / … — последний запуск «Копии базы»
}

const name = `coalesce(nullif(trim(p.first_name || ' ' || p.last_name), ''), nullif(p.full_name, ''), p.nickname,
  (select u.email from auth.users u where u.id = p.id), '—')`;
const topicTitle = (t: string, s: string) =>
  `coalesce(nullif(${s}.name_ru, ''), ${s}.name_kk) || ', ' || ${t}.grade || ' кл. — ' || coalesce(nullif(${t}.title_ru, ''), nullif(${t}.title_kk, ''), ${t}.title_en)`;
/** Начало текста, который ставит submit_report при скрытии вопроса жалобами (миграция reports_autohide). */
const HIDDEN_PREFIX = "Оқушылар қате туралы хабарлады";

export async function collectWeekly(db: Db, since: Date): Promise<WeeklyData> {
  const s = since.toISOString();
  const [c] = await db.query<Record<string, string | number>>(`
    select
      (select count(*) from public.profiles where role = 'teacher')::int as teachers,
      (select count(*) from public.profiles where role = 'student')::int as students,
      (select count(*) from public.profiles where role = 'student' and created_at >= $1)::int as students_new,
      (select count(*) from public.questions where status = 'published')::int as published,
      (select count(*) from public.questions where created_at >= $1)::int as questions_new,
      (select count(*) from public.questions where created_at >= $1 and status = 'published')::int as published_new,
      (select count(*) from public.questions where status = 'draft')::int as drafts,
      (select count(*) from public.questions where status = 'review')::int as review,
      (select count(*) from public.reports where created_at >= $1)::int as reports_new,
      (select count(*) from public.reports where status = 'new')::int as reports_open,
      (select count(*) from public.attempts where created_at >= $1)::int as tests,
      (select count(*) from public.attempts where created_at >= $1 and user_id is null)::int as tests_guests,
      (select count(distinct student_id) from school.test_runs where finished_at >= $1)::int as active_students,
      (select count(*) from school.classes)::int as classes,
      (select count(*) from school.classes where created_at >= $1)::int as classes_new,
      (select count(*) from school.assignments where created_at >= $1)::int as assignments_new,
      jsonb_array_length(public.site_catalog() -> 'topics') as topics_shown,
      (select count(*) from public.schools where not approved)::int as schools_waiting`, [s]);
  const teachersNew = await db.query<WeeklyTeacher>(`
    select ${name} as name, coalesce(nullif(sc.name_kk, ''), sc.name_ru, p.school_other, '') as school,
      (select count(*) from public.questions q where q.author_id = p.id)::int as questions
    from public.profiles p left join public.schools sc on sc.id = p.school_id
    where p.role = 'teacher' and p.created_at >= $1 order by p.created_at`, [s]);
  const hidden = await db.query<{ topic: string; comment: string }>(`
    select ${topicTitle("t", "sb")} as topic, q.review_comment as comment
    from public.questions q join public.topics t on t.id = q.topic_id join public.subjects sb on sb.id = t.subject_id
    where q.status = 'review' and q.review_comment like $1 order by q.updated_at desc`, [HIDDEN_PREFIX + "%"]);
  const topTopics = await db.query<{ title: string; tests: number }>(`
    select ${topicTitle("t", "sb")} as title, count(*)::int as tests
    from public.attempts a join public.topics t on t.id = a.topic_id join public.subjects sb on sb.id = t.subject_id
    where a.created_at >= $1 group by t.id, sb.id order by tests desc, title limit 5`, [s]);
  const topAuthors = await db.query<{ name: string; questions: number }>(`
    select ${name} as name, count(*)::int as questions
    from public.questions q join public.profiles p on p.id = q.author_id
    where q.created_at >= $1 group by p.id order by questions desc, name limit 5`, [s]);
  // Ничего не начал: ни вопросов, ни классов. Класс без учеников: классы есть, никто не вошёл.
  // Учитель только с вопросами и без класса не застрял — так тоже работают. Заблокированных не считаем.
  const stuck = await db.query<WeeklyStuck>(`
    select name, email, school, why, days, last_seen as "lastSeen" from (
      select ${name} as name, coalesce(u.email, '') as email,
        coalesce(nullif(sc.name_kk, ''), sc.name_ru, p.school_other, '') as school,
        (extract(epoch from (now() - p.created_at)) / 86400)::int as days, u.last_sign_in_at as last_seen,
        (select count(*) from public.questions q where q.author_id = p.id) as qs,
        (select count(*) from school.classes k where k.teacher_id = p.id) as cls,
        (select count(*) from school.class_members m join school.classes k on k.id = m.class_id where k.teacher_id = p.id) as kids,
        case when (select count(*) from school.classes k where k.teacher_id = p.id) = 0 then 'nothing' else 'noStudents' end as why
      from public.profiles p left join auth.users u on u.id = p.id left join public.schools sc on sc.id = p.school_id
      where p.role = 'teacher' and p.blocked_at is null and p.created_at < $1
    ) x where (qs = 0 and cls = 0) or (cls > 0 and kids = 0)
    order by days desc`, [s]);
  const n = (k: string) => Number(c[k]);
  return {
    since: s, teachersNew, hidden, topTopics, topAuthors, stuck,
    teachers: n("teachers"), students: n("students"), studentsNew: n("students_new"), published: n("published"),
    questionsNew: n("questions_new"), publishedNew: n("published_new"), drafts: n("drafts"), review: n("review"),
    reportsNew: n("reports_new"), reportsOpen: n("reports_open"), tests: n("tests"), testsGuests: n("tests_guests"),
    activeStudents: n("active_students"), classes: n("classes"), classesNew: n("classes_new"),
    assignmentsNew: n("assignments_new"), topicsShown: n("topics_shown"), schoolsWaiting: n("schools_waiting"),
  };
}

/** Дата по Алматы: «28.10.2026». */
function day(d: Date): string {
  return d.toLocaleDateString("ru-RU", { timeZone: "Asia/Almaty", day: "2-digit", month: "2-digit", year: "numeric" });
}

const plus = (n: number) => (n > 0 ? ` (+${n} за неделю)` : "");

export function formatWeekly(d: WeeklyData, now: Date, health?: WeeklyHealth): { subject: string; text: string } {
  const todo: string[] = [];
  if (d.review - d.hidden.length > 0) todo.push(`${d.review - d.hidden.length} вопр. ждут проверки во вкладке «Тексеруде» (/admin)`);
  if (d.stuck.length > 0) todo.push(`${d.stuck.length} учит. застряли — напишите им (список в разделе «Учителя»)`);
  if (d.schoolsWaiting > 0) todo.push(`${d.schoolsWaiting} школ ждут одобрения (/admin → «Мектептер»)`);
  if (health && health.checksFailed > 0) todo.push(`проверка сайта не прошла ${health.checksFailed} раз — посмотрите Actions на GitHub`);
  if (health && health.backup !== "success") todo.push(`последняя копия базы: ${health.backup || "нет запуска"} — посмотрите Actions на GitHub`);

  const lines: string[] = [];
  lines.push(`Білімтест: неделя ${day(new Date(d.since))} — ${day(now)}`, "");
  lines.push(todo.length ? "ЧТО СДЕЛАТЬ" : "ЧТО СДЕЛАТЬ: ничего, всё работает само ✓");
  for (const t of todo) lines.push(`• ${t}`);
  lines.push("");

  lines.push("УЧЕНИКИ");
  lines.push(`• тестов пройдено: ${d.tests} (из них гостями без входа: ${d.testsGuests})`);
  lines.push(`• учеников с аккаунтом решали тесты: ${d.activeStudents}`);
  lines.push(`• учеников с аккаунтом: ${d.students}${plus(d.studentsNew)}`);
  if (d.topTopics.length) {
    lines.push("• популярные темы:");
    for (const t of d.topTopics) lines.push(`    ${t.title} — ${t.tests}`);
  }
  lines.push("");

  lines.push("УЧИТЕЛЯ");
  lines.push(`• учителей: ${d.teachers}${plus(d.teachersNew.length)}`);
  for (const t of d.teachersNew) lines.push(`    новый: ${t.name}${t.school ? `, ${t.school}` : ""} — вопросов: ${t.questions}`);
  lines.push(`• классов: ${d.classes}${plus(d.classesNew)}; заданий выдано за неделю: ${d.assignmentsNew}`);
  if (d.stuck.length) {
    lines.push("• застряли (зарегистрированы больше недели назад):");
    for (const x of d.stuck.slice(0, 10)) {
      const seen = x.lastSeen ? `последний вход ${day(new Date(x.lastSeen))}` : "ни разу не входил";
      lines.push(`    ${x.name}${x.email ? ` <${x.email}>` : ""}${x.school ? `, ${x.school}` : ""} — ${x.why === "nothing" ? "ни вопросов, ни класса" : "в классе нет учеников"}; ${x.days} дн. на сайте, ${seen}`);
    }
    if (d.stuck.length > 10) lines.push(`    … и ещё ${d.stuck.length - 10}`);
    lines.push("    Подсказка: «Нұсқаулық» в админке и «Оқушыларға жадынама» на странице класса.");
  }
  lines.push("");

  lines.push("ВОПРОСЫ");
  lines.push(`• опубликовано: ${d.published}; тем видно ученикам: ${d.topicsShown}`);
  lines.push(`• добавлено за неделю: ${d.questionsNew} (из них уже опубликовано: ${d.publishedNew}); черновиков всего: ${d.drafts}`);
  if (d.topAuthors.length) lines.push(`• больше всех добавили: ${d.topAuthors.map((a) => `${a.name} (${a.questions})`).join(", ")}`);
  lines.push("");

  lines.push("ЖАЛОБЫ УЧЕНИКОВ");
  lines.push(`• новых за неделю: ${d.reportsNew}; не разобрано всего: ${d.reportsOpen}`);
  lines.push(`• скрыто жалобами (автор исправит сам): ${d.hidden.length}`);
  for (const h of d.hidden.slice(0, 5)) {
    const why = h.comment.slice(h.comment.indexOf(":") + 1).trim();
    lines.push(`    ${h.topic}: ${why.length > 120 ? why.slice(0, 119) + "…" : why}`);
  }
  if (d.hidden.length > 5) lines.push(`    … и ещё ${d.hidden.length - 5}`);

  if (health) {
    lines.push("", "РАБОТА САЙТА");
    lines.push(`• проверок за неделю: ${health.checksTotal}, не прошли: ${health.checksFailed}`);
    lines.push(`• копия базы: ${health.backup === "success" ? "сделана ✓" : health.backup || "нет запуска"}`);
  }
  lines.push("", "Письмо отправлено автоматически (GitHub Actions, weekly.yml).");

  const subject = `Білімтест за неделю: тестов ${d.tests}, учителей ${d.teachers}` + (todo.length ? ` · дел: ${todo.length}` : " · всё ✓");
  return { subject, text: lines.join("\n") };
}
