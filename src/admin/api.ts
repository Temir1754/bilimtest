// Всё, что админка делает с базой. Экраны работают через интерфейс AdminApi,
// поэтому в тестах вместо Supabase подставляется простая заглушка.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminText } from "../i18n/admin";
import { setRemember } from "../lib/account";
import type { Lang } from "../lib/types";
import type { QuestionRow, Role, Status, toPayload } from "./form";

export interface SubjectRow {
  id: string;
  slug: string;
  icon: string;
  name_kk: string;
  name_ru: string;
  name_en: string;
  only_lang: Lang | null;
  sort_order: number;
}

/** Область или город республиканского значения (parent_id пустой); внутри — районы и города (№77). */
export interface RegionRow {
  id: string;
  parent_id: string | null;
  name_kk: string;
  name_ru: string;
  sort_order: number;
}

export interface SchoolRow {
  id: string;
  region_id: string;
  name_kk: string;
  name_ru: string;
  approved: boolean;
}

/** Раздел — группа тем внутри предмета и класса (DECISIONS.md №48). */
export interface SectionRow {
  id: string;
  subject_id: string;
  grade: number;
  title_kk: string;
  title_ru: string;
  title_en: string;
  sort_order: number;
}

export interface TopicRow {
  id: string;
  subject_id: string;
  grade: number;
  section_id: string | null; // null — старая тема без раздела
  title_kk: string;
  title_ru: string;
  title_en: string;
  sort_order: number;
}

/** Строка списка вопросов: без вариантов, с темой (класс, предмет, название). */
export interface QuestionItem {
  id: string;
  topic_id: string;
  status: Status;
  text_kk: string | null;
  text_ru: string | null;
  text_en: string | null;
  review_comment: string | null;
  updated_at: string;
  teacher_check?: string | null;
  topics: Pick<TopicRow, "grade" | "subject_id" | "title_kk" | "title_ru" | "title_en">;
}

export interface Me {
  id: string;
  email: string;
  role: Role;
  nickname?: string | null;
}

export interface QuestionFilter {
  topicId?: string;
  sectionId?: string;
  subjectId?: string;
  grade?: number;
  status?: Status;
  missingLang?: Lang; // вопросы без текста на этом языке
  search?: string;
  teacherCheck?: boolean; // только «требует проверки учителем»
}

export type Counts = Record<Status, number>;

/** Вопрос с пометкой «требует проверки учителем» и его тема. */
export interface CheckItem {
  grade: number;
  subject: SubjectRow;
  topic: string;
  q: QuestionRow;
}

export interface AdminApi {
  /** Текущий пользователь с ролью; null — не вошёл. */
  me(): Promise<Me | null>;
  onAuthChange(cb: () => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Письмо со ссылкой для нового пароля; ссылка ведёт в /admin?reset. */
  resetPassword(email: string): Promise<void>;
  /** Новый пароль для того, кто вошёл по ссылке из письма. */
  setPassword(password: string): Promise<void>;

  subjects(): Promise<SubjectRow[]>;
  /** id предметов, у которых в классе есть разделы или темы (кроме скрытых). */
  gradeSubjects(grade: number): Promise<string[]>;
  saveSubject(s: Omit<SubjectRow, "id"> & { id?: string }): Promise<void>;
  deleteSubject(id: string): Promise<void>;

  sections(subjectId: string, grade: number): Promise<SectionRow[]>;
  saveSection(s: Omit<SectionRow, "id"> & { id?: string }): Promise<void>;
  /** Удаляет раздел (админ); его темы остаются без раздела. */
  deleteSection(id: string): Promise<void>;

  topics(subjectId: string, grade: number): Promise<TopicRow[]>;
  topic(id: string): Promise<TopicRow>;
  /** Число вопросов в темах по статусам (учитель видит опубликованные и свои). */
  counts(topicIds: string[]): Promise<Record<string, Counts>>;
  saveTopic(t: Omit<TopicRow, "id"> & { id?: string }): Promise<void>;
  deleteTopic(id: string): Promise<void>;

  questions(f: QuestionFilter): Promise<QuestionItem[]>;
  question(id: string): Promise<QuestionRow>;
  saveQuestion(p: ReturnType<typeof toPayload>): Promise<string>;
  deleteQuestion(id: string): Promise<void>;
  /** Снимает пометку «требует проверки учителем» (админ). */
  clearTeacherCheck(id: string): Promise<void>;
  uploadImage(file: File): Promise<string>;

  /** Справочник для регистрации: области → районы и города → школы. Меняет только админ. */
  regions(): Promise<RegionRow[]>;
  saveRegion(r: Omit<RegionRow, "id"> & { id?: string }): Promise<void>;
  deleteRegion(id: string): Promise<void>;
  schools(regionId: string): Promise<SchoolRow[]>;
  saveSchool(s: Omit<SchoolRow, "id"> & { id?: string }): Promise<void>;
  deleteSchool(id: string): Promise<void>;

  /** Загрузка из Excel одной транзакцией; все вопросы — черновики. */
  importQuestions(subjectId: string, grade: number, rows: unknown[]): Promise<{ questions: number; topics: number }>;
  /** Публикует вопросы (админ). Перед вызовом их проверяет publishProblems; база проверяет ещё раз. */
  publish(ids: string[]): Promise<void>;
  /** Вопросы с вариантами для выгрузки в Excel, по порядку тем. */
  exportQuestions(subjectId: string, grade: number, topicId?: string): Promise<{ topic: string; q: QuestionRow }[]>;
  /** Все вопросы с пометкой «требует проверки учителем» — для выгрузки в Excel. */
  exportChecks(): Promise<CheckItem[]>;
}

/** Сообщения базы и Supabase → понятный текст на языке админки. */
export function humanError(e: unknown, t: AdminText): string {
  const m = (e as { message?: string })?.message ?? String(e);
  const r = t.err;
  if (/Invalid login credentials/i.test(m)) return r.invalidLogin;
  if (/Email not confirmed/i.test(m)) return r.emailNotConfirmed;
  if (/Password should be|weak.?password/i.test(m)) return r.weakPassword;
  if (/should be different from the old/i.test(m)) return r.samePassword;
  if (/rate limit|For security purposes/i.test(m)) return r.rateLimit;
  if (/не найден или нет прав/i.test(m)) return r.notFound;
  if (/row-level security|permission denied|42501/i.test(m)) return r.noRights;
  if (/violates foreign key constraint/i.test(m)) return r.fk;
  if (/duplicate key/i.test(m)) return r.duplicate;
  if (/Failed to fetch|NetworkError/i.test(m)) return r.network;
  if (m === "image_too_big") return r.imageTooBig;
  if (/не больше 4 вариантов/i.test(m)) return t.problems.max4;
  if (/не указана тема/i.test(m)) return t.xl.rowErr.noTopic;
  if (/от 1 до 2000/i.test(m)) return r.tooMany;
  if (/3–4 варианта|ровно один правильный|нет текста на языке|у варианта ответа нет текста/i.test(m)) return r.incomplete;
  if (/Could not find the function|PGRST202/i.test(m)) return r.noDbFunction;
  return m;
}

const QUESTION_COLS = "id, topic_id, text_kk, text_ru, text_en, explanation_kk, explanation_ru, explanation_en, " +
  "image_url, difficulty, status, review_comment, teacher_check, author_id, options(id, sort_order, is_correct, text_kk, text_ru, text_en)";

const TOPIC_COLS = "id, subject_id, grade, section_id, title_kk, title_ru, title_en, sort_order";

/** Убирает из строки поиска символы, которые ломают фильтр PostgREST. */
const cleanSearch = (s: string) => s.replace(/[%*,()"\\]/g, " ").trim();

export function supabaseApi(sb: SupabaseClient): AdminApi {
  // Ошибку отдаём экрану как есть: он переводит её через humanError на язык админки.
  const check = <T>({ data, error }: { data: T; error: unknown }) => {
    if (error) throw error instanceof Error ? error : new Error((error as { message?: string }).message ?? String(error));
    return data;
  };

  return {
    async me() {
      const { data } = await sb.auth.getSession();
      const user = data.session?.user;
      if (!user) return null;
      const p = check(await sb.from("profiles").select("role, nickname").eq("id", user.id).maybeSingle());
      return { id: user.id, email: user.email ?? "", role: (p?.role as Role | undefined) ?? "student", nickname: p?.nickname };
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN" || event === "SIGNED_OUT") cb();
      });
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      setRemember(true); // вход в админку помнится, как раньше (галочка «Мені есте сақта» — только на /login)
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/admin?reset` });
      if (error) throw error;
    },
    async setPassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
    },

    async subjects() {
      return check(await sb.from("subjects").select("*").order("sort_order")) as SubjectRow[];
    },
    async gradeSubjects(grade) {
      const [secs, tps] = await Promise.all([
        sb.from("sections").select("subject_id").eq("grade", grade).limit(5000).then(check),
        sb.from("topics").select("subject_id").eq("grade", grade).eq("archived", false).limit(5000).then(check),
      ]);
      return [...new Set([...(secs as { subject_id: string }[]), ...(tps as { subject_id: string }[])].map((r) => r.subject_id))];
    },
    async saveSubject({ id, ...s }) {
      check(id ? await sb.from("subjects").update(s).eq("id", id) : await sb.from("subjects").insert(s));
    },
    async deleteSubject(id) {
      check(await sb.from("subjects").delete().eq("id", id));
    },

    async sections(subjectId, grade) {
      return check(await sb.from("sections").select("id, subject_id, grade, title_kk, title_ru, title_en, sort_order")
        .eq("subject_id", subjectId).eq("grade", grade).order("sort_order")) as SectionRow[];
    },
    async saveSection({ id, ...s }) {
      check(id ? await sb.from("sections").update(s).eq("id", id) : await sb.from("sections").insert(s));
    },
    async deleteSection(id) {
      check(await sb.from("sections").delete().eq("id", id));
    },

    async topics(subjectId, grade) {
      return check(await sb.from("topics").select(TOPIC_COLS)
        .eq("subject_id", subjectId).eq("grade", grade).eq("archived", false).order("sort_order")) as TopicRow[];
    },
    async topic(id) {
      return check(await sb.from("topics").select(TOPIC_COLS)
        .eq("id", id).single()) as TopicRow;
    },
    async counts(topicIds) {
      const out: Record<string, Counts> = {};
      if (!topicIds.length) return out;
      const rows = check(await sb.from("questions").select("topic_id, status").in("topic_id", topicIds)
        .limit(10000)) as { topic_id: string; status: Status }[];
      for (const r of rows) (out[r.topic_id] ??= { draft: 0, review: 0, published: 0 })[r.status]++;
      return out;
    },
    async saveTopic({ id, ...t }) {
      check(id ? await sb.from("topics").update(t).eq("id", id) : await sb.from("topics").insert(t));
    },
    async deleteTopic(id) {
      check(await sb.from("topics").delete().eq("id", id));
    },

    async questions(f) {
      let q = sb.from("questions")
        .select("id, topic_id, status, text_kk, text_ru, text_en, review_comment, teacher_check, updated_at, " +
          "topics!inner(grade, subject_id, title_kk, title_ru, title_en)")
        .order("sort_order").limit(300);
      if (f.topicId) q = q.eq("topic_id", f.topicId);
      if (f.sectionId) q = q.eq("topics.section_id", f.sectionId);
      if (f.subjectId) q = q.eq("topics.subject_id", f.subjectId);
      if (f.grade) q = q.eq("topics.grade", f.grade);
      if (f.status) q = q.eq("status", f.status);
      if (f.teacherCheck) q = q.not("teacher_check", "is", null);
      if (f.missingLang) q = q.or(`text_${f.missingLang}.is.null,text_${f.missingLang}.eq.`);
      const s = cleanSearch(f.search ?? "");
      if (s) q = q.or(["kk", "ru", "en"].map((l) => `text_${l}.ilike."*${s}*"`).join(","));
      return check(await q) as unknown as QuestionItem[];
    },
    async question(id) {
      return check(await sb.from("questions").select(QUESTION_COLS).eq("id", id).single()) as unknown as QuestionRow;
    },
    async saveQuestion(p) {
      return check(await sb.rpc("save_question", p)) as string;
    },
    async deleteQuestion(id) {
      check(await sb.from("questions").delete().eq("id", id));
    },
    async clearTeacherCheck(id) {
      check(await sb.from("questions").update({ teacher_check: null }).eq("id", id));
    },
    async uploadImage(file) {
      if (file.size > 2 * 1024 * 1024) throw new Error("image_too_big");
      const { data } = await sb.auth.getSession();
      const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
      const path = `${data.session?.user.id ?? "anon"}/${crypto.randomUUID()}.${ext}`;
      check(await sb.storage.from("question-images").upload(path, file, { contentType: file.type }));
      return sb.storage.from("question-images").getPublicUrl(path).data.publicUrl;
    },

    async regions() {
      return check(await sb.from("regions").select("id, parent_id, name_kk, name_ru, sort_order")
        .order("sort_order").order("name_ru").limit(5000)) as RegionRow[];
    },
    async saveRegion({ id, ...r }) {
      check(id ? await sb.from("regions").update(r).eq("id", id) : await sb.from("regions").insert(r));
    },
    async deleteRegion(id) {
      check(await sb.from("regions").delete().eq("id", id));
    },
    async schools(regionId) {
      return check(await sb.from("schools").select("id, region_id, name_kk, name_ru, approved")
        .eq("region_id", regionId).order("name_ru").limit(2000)) as SchoolRow[];
    },
    async saveSchool({ id, ...x }) {
      check(id ? await sb.from("schools").update(x).eq("id", id) : await sb.from("schools").insert(x));
    },
    async deleteSchool(id) {
      check(await sb.from("schools").delete().eq("id", id));
    },

    async importQuestions(subjectId, grade, rows) {
      return check(await sb.rpc("import_questions", { p_subject_id: subjectId, p_grade: grade, p_rows: rows })) as
        { questions: number; topics: number };
    },
    async publish(ids) {
      // Пачками по 100: список id передаётся в адресе запроса, а у адреса есть предел длины.
      for (let i = 0; i < ids.length; i += 100) {
        check(await sb.from("questions").update({ status: "published", review_comment: null })
          .in("id", ids.slice(i, i + 100)));
      }
    },
    async exportChecks() {
      const [subjects, rows] = await Promise.all([this.subjects(), sb.from("questions")
        .select(`${QUESTION_COLS}, topics!inner(grade, subject_id, title_kk, title_ru, title_en)`)
        .not("teacher_check", "is", null).limit(10000).then(check)]);
      type Row = QuestionRow & { topics: Pick<TopicRow, "grade" | "subject_id" | "title_kk" | "title_ru" | "title_en"> };
      return (rows as unknown as Row[]).map(({ topics: t, ...q }) => ({
        grade: t.grade, subject: subjects.find((s) => s.id === t.subject_id)!,
        topic: t.title_ru || t.title_kk || t.title_en, q,
      })).sort((a, b) => a.grade - b.grade || a.subject.sort_order - b.subject.sort_order || a.topic.localeCompare(b.topic));
    },
    async exportQuestions(subjectId, grade, topicId) {
      const topics = (await this.topics(subjectId, grade)).filter((t) => !topicId || t.id === topicId);
      if (!topics.length) return [];
      const rows = check(await sb.from("questions").select(QUESTION_COLS).in("topic_id", topics.map((t) => t.id))
        .order("sort_order").limit(10000)) as unknown as QuestionRow[];
      return topics.flatMap((t) => rows.filter((q) => q.topic_id === t.id)
        .map((q) => ({ topic: t.title_ru || t.title_kk || t.title_en, q })));
    },
  };
}
