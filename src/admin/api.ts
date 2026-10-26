// Всё, что админка делает с базой. Экраны работают через интерфейс AdminApi,
// поэтому в тестах вместо Supabase подставляется простая заглушка.
import type { SupabaseClient } from "@supabase/supabase-js";
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

export interface TopicRow {
  id: string;
  subject_id: string;
  grade: number;
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
  topics: Pick<TopicRow, "grade" | "subject_id" | "title_kk" | "title_ru" | "title_en">;
}

export interface Me {
  id: string;
  email: string;
  role: Role;
}

export interface QuestionFilter {
  topicId?: string;
  subjectId?: string;
  grade?: number;
  status?: Status;
  missingLang?: Lang; // вопросы без текста на этом языке
  search?: string;
}

export type Counts = Record<Status, number>;

export interface AdminApi {
  /** Текущий пользователь с ролью; null — не вошёл. */
  me(): Promise<Me | null>;
  onAuthChange(cb: () => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;

  subjects(): Promise<SubjectRow[]>;
  saveSubject(s: Omit<SubjectRow, "id"> & { id?: string }): Promise<void>;
  deleteSubject(id: string): Promise<void>;

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
  uploadImage(file: File): Promise<string>;
}

/** Сообщения базы → понятный текст. */
export function humanError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/Invalid login credentials/i.test(m)) return "Неверный email или пароль.";
  if (/Email not confirmed/i.test(m)) return "Email не подтверждён. Подтвердите его в Supabase.";
  if (/row-level security|permission denied|42501/i.test(m)) return "Нет прав на это действие.";
  if (/violates foreign key constraint/i.test(m)) return "Нельзя удалить: внутри есть темы или вопросы.";
  if (/duplicate key/i.test(m)) return "Такая запись уже есть.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Нет связи с базой. Проверьте интернет и попробуйте ещё раз.";
  return m.replace(/^Вопрос [0-9a-f-]{36}: /, "");
}

const QUESTION_COLS = "id, topic_id, text_kk, text_ru, text_en, explanation_kk, explanation_ru, explanation_en, " +
  "image_url, difficulty, status, review_comment, author_id, options(id, sort_order, is_correct, text_kk, text_ru, text_en)";

/** Убирает из строки поиска символы, которые ломают фильтр PostgREST. */
const cleanSearch = (s: string) => s.replace(/[%*,()"\\]/g, " ").trim();

export function supabaseApi(sb: SupabaseClient): AdminApi {
  const check = <T>({ data, error }: { data: T; error: unknown }) => {
    if (error) throw new Error(humanError(error));
    return data;
  };

  return {
    async me() {
      const { data } = await sb.auth.getSession();
      const user = data.session?.user;
      if (!user) return null;
      const p = check(await sb.from("profiles").select("role").eq("id", user.id).maybeSingle());
      return { id: user.id, email: user.email ?? "", role: (p?.role as Role | undefined) ?? "student" };
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN" || event === "SIGNED_OUT") cb();
      });
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(humanError(error));
    },
    async signOut() {
      await sb.auth.signOut();
    },

    async subjects() {
      return check(await sb.from("subjects").select("*").order("sort_order")) as SubjectRow[];
    },
    async saveSubject({ id, ...s }) {
      check(id ? await sb.from("subjects").update(s).eq("id", id) : await sb.from("subjects").insert(s));
    },
    async deleteSubject(id) {
      check(await sb.from("subjects").delete().eq("id", id));
    },

    async topics(subjectId, grade) {
      return check(await sb.from("topics").select("id, subject_id, grade, title_kk, title_ru, title_en, sort_order")
        .eq("subject_id", subjectId).eq("grade", grade).order("sort_order")) as TopicRow[];
    },
    async topic(id) {
      return check(await sb.from("topics").select("id, subject_id, grade, title_kk, title_ru, title_en, sort_order")
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
        .select("id, topic_id, status, text_kk, text_ru, text_en, review_comment, updated_at, " +
          "topics!inner(grade, subject_id, title_kk, title_ru, title_en)")
        .order("sort_order").limit(300);
      if (f.topicId) q = q.eq("topic_id", f.topicId);
      if (f.subjectId) q = q.eq("topics.subject_id", f.subjectId);
      if (f.grade) q = q.eq("topics.grade", f.grade);
      if (f.status) q = q.eq("status", f.status);
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
    async uploadImage(file) {
      if (file.size > 2 * 1024 * 1024) throw new Error("Картинка больше 2 МБ. Уменьшите её и попробуйте снова.");
      const { data } = await sb.auth.getSession();
      const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
      const path = `${data.session?.user.id ?? "anon"}/${crypto.randomUUID()}.${ext}`;
      check(await sb.storage.from("question-images").upload(path, file, { contentType: file.type }));
      return sb.storage.from("question-images").getPublicUrl(path).data.publicUrl;
    },
  };
}
