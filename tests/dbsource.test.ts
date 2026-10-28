// Источник данных сайта из базы (этап 4): ответ функций базы → модель сайта, кэш каталога, порог темы.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dbSource, toCatalog, toQuestions } from "../src/lib/dbSource";
import { visibleTopics } from "../src/lib/types";

const raw = {
  min: 5,
  subjects: [{ id: "s1", slug: "math", icon: "π", name_kk: "Математика", name_ru: "Математика", name_en: "Math", only_lang: null, sort_order: 0 }],
  sections: [{ id: "sec1", subject_id: "s1", grade: 5, title_kk: "Бөлшек", title_ru: "Дроби", title_en: "Fractions", sort_order: 0 }],
  topics: [
    { id: "t1", subject_id: "s1", grade: 5, section_id: "sec1", title_kk: "А", title_ru: "А", title_en: "A", sort_order: 0, kk: 7, ru: 3, en: 0 },
    { id: "t2", subject_id: "s1", grade: 5, section_id: null, title_kk: "Б", title_ru: "Б", title_en: "B", sort_order: 1, kk: 5, ru: 5, en: 5 },
  ],
};
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

beforeEach(() => localStorage.clear());

describe("сайт на базе: dbSource", () => {
  it("каталог: числа по языкам; тема видна на языке, где готовых вопросов не меньше порога", () => {
    const c = toCatalog(raw);
    expect(c.topics[0]).toMatchObject({ sectionId: "sec1", ready: { kk: 7, ru: 3, en: 0 }, questionCount: 7 });
    expect(visibleTopics(c, "kk").map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(visibleTopics(c, "ru").map((t) => t.id)).toEqual(["t2"]); // на русском в t1 только 3
    expect(c.sections?.[0].title.ru).toBe("Дроби");
  });

  it("вопросы: id вариантов и правильный ответ; пустое пояснение — null", () => {
    const [q] = toQuestions([{ id: "q1", topic_id: "t1", text_kk: "?", text_ru: null, text_en: null, image_url: null,
      explanation_kk: null, explanation_ru: null, explanation_en: null,
      options: [{ id: "o1", text_kk: "а", is_correct: true }, { id: "o2", text_kk: "б", is_correct: false }] }]);
    expect(q.explanation).toBeNull();
    expect(q.options).toEqual([{ id: "o1", text: { kk: "а", ru: "", en: "" }, correct: true },
      { id: "o2", text: { kk: "б", ru: "", en: "" }, correct: false }]);
  });

  it("каталог сохраняется в браузере: база недоступна — сайт работает на сохранённом", async () => {
    const fetchFn = vi.fn(async () => ok(raw));
    const src = dbSource("https://x.supabase.co", "pk", fetchFn as unknown as typeof fetch);
    expect((await src.catalog()).topics).toHaveLength(2);
    expect(fetchFn).toHaveBeenCalledWith("https://x.supabase.co/rest/v1/rpc/site_catalog", expect.objectContaining({ method: "POST" }));

    // каталог устарел, база не отвечает → сохранённый
    const saved = JSON.parse(localStorage.getItem("bt-catalog")!);
    localStorage.setItem("bt-catalog", JSON.stringify({ ...saved, at: 0 }));
    const down = dbSource("https://x.supabase.co", "pk", (async () => { throw new Error("offline"); }) as unknown as typeof fetch);
    expect((await down.catalog()).topics).toHaveLength(2);

    localStorage.clear();
    await expect(down.catalog()).rejects.toThrow(/offline/);
  });

  it("вопросы запрашиваются с языком ученика", async () => {
    const fetchFn = vi.fn(async (_u: string, _init?: RequestInit) => ok([]));
    await dbSource("https://x.supabase.co", "pk", fetchFn as unknown as typeof fetch).questions(["t1"], "ru");
    expect(JSON.parse(fetchFn.mock.calls[0][1]!.body as string)).toEqual({ p_topic_ids: ["t1"], p_lang: "ru" });
  });

  it("вошедший ученик: запрос с его токеном (результат — в его аккаунт); истёкший — как гость", async () => {
    const fetchFn = vi.fn(async (_u: string, _init?: RequestInit) => ok({ ok: true }));
    const src = dbSource("https://x.supabase.co", "pk", fetchFn as unknown as typeof fetch);
    const auth = () => (fetchFn.mock.calls.at(-1)![1]!.headers as Record<string, string>).Authorization;
    sessionStorage.setItem("sb-abc-auth-token", JSON.stringify({ access_token: "tok", expires_at: Date.now() / 1000 + 3600 }));
    await src.submit!({ subjectId: "s1", grade: 5, topicId: "t1", answers: [{ question_id: "q1", option_id: "o1" }] });
    expect(auth()).toBe("Bearer tok");
    expect(fetchFn.mock.calls.at(-1)![0]).toMatch(/rpc\/submit_attempt$/);
    sessionStorage.setItem("sb-abc-auth-token", JSON.stringify({ access_token: "old", expires_at: 1 }));
    await src.report!("q1", "Ошибка", "kk", "");
    expect(auth()).toBeUndefined();
    sessionStorage.clear();
  });
});
