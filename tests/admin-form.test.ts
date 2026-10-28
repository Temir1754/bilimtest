import { describe, expect, it } from "vitest";
import {
  canEdit, copyFromRu, fromRow, newForm, padOptions, publishProblems, readyIn, saveProblems, toPayload, toQuestion,
  type QuestionRow,
} from "../src/admin/form";
import { flatTopics, groupTopics, renumber, swap } from "../src/admin/tree";
import type { SectionRow, TopicRow } from "../src/admin/api";
import { ADMIN } from "../src/i18n/admin";

const T = ADMIN.ru;

const row: QuestionRow = {
  id: "q1", topic_id: "t1", text_kk: "Сұрақ", text_ru: "Вопрос", text_en: null,
  explanation_kk: null, explanation_ru: "Потому что", explanation_en: null,
  image_url: null, difficulty: 2, status: "draft", review_comment: null, author_id: "teacher",
  options: [
    { sort_order: 1, is_correct: false, text_kk: "б", text_ru: "б", text_en: null },
    { sort_order: 0, is_correct: true, text_kk: "а", text_ru: "а", text_en: null },
    { sort_order: 2, is_correct: false, text_kk: "в", text_ru: "в", text_en: null },
  ],
};

describe("форма вопроса", () => {
  it("строка базы → форма → данные для save_question", () => {
    const f = fromRow(row);
    expect(f.options.map((o) => o.text.ru)).toEqual(["а", "б", "в"]);
    expect(f.text).toEqual({ kk: "Сұрақ", ru: "Вопрос", en: "" });
    const p = toPayload(f, "review");
    expect(p.p_id).toBe("q1");
    expect(p.p_q).toMatchObject({ topic_id: "t1", status: "review", text_en: null, explanation_ru: "Потому что" });
    expect(p.p_options[0]).toEqual({ text_kk: "а", text_ru: "а", text_en: null, is_correct: true });
  });

  it("перед публикацией находит то же, что проверяет база: хватает одного полного языка (№88)", () => {
    const f = fromRow(row);
    expect(readyIn(f, "ru")).toBe(true);
    expect(readyIn(f, "en")).toBe(false);
    expect(publishProblems(f, null, T)).toEqual([]);
    // Ни один язык не полный: подсказка — по языку, который начали заполнять.
    const ruOnly = { ...f, text: { kk: "", ru: "Вопрос", en: "" }, options: f.options.map((o, i) => (i ? o : { ...o, text: { ...o.text, ru: "", kk: "а" } })) };
    expect(publishProblems(ruOnly, null, T)).toEqual(["Нет текста варианта A на русском языке."]);
    // У языкового предмета (русский язык) нужен только русский.
    expect(publishProblems(f, "ru", T)).toEqual([]);
    const two = { ...f, options: f.options.slice(0, 2).map((o) => ({ ...o, correct: false })) };
    expect(publishProblems(two, "ru", T)).toEqual(["Нужно 3 или 4 варианта ответа, сейчас 2.", "Отметьте правильный ответ."]);
  });

  it("4-й ответ необязателен: пустые строки не сохраняются; в форме всегда 4 строки", () => {
    const f = padOptions(fromRow(row));
    expect(f.options).toHaveLength(4);
    expect(publishProblems(f, null, T)).toEqual([]);
    expect(toPayload(f, "published").p_options).toHaveLength(3);
    expect(newForm("t1").options.some((o) => o.correct)).toBe(false);
  });

  it("черновик можно сохранить незаконченным, но не пустым", () => {
    const f = newForm("t1");
    expect(saveProblems(f, T)).toEqual(["Напишите вопрос."]);
    expect(saveProblems({ ...f, text: { kk: "", ru: "x", en: "" } }, T)).toEqual([]);
  });

  it("«Скопировать из русского» заполняет только пустые поля", () => {
    const f = copyFromRu(fromRow(row), "en");
    expect(f.text.en).toBe("Вопрос");
    expect(f.options.map((o) => o.text.en)).toEqual(["а", "б", "в"]);
    expect(f.explanation.en).toBe("Потому что");
    expect(copyFromRu(fromRow(row), "kk").text.kk).toBe("Сұрақ");
  });

  it("предпросмотр получает вопрос в формате сайта", () => {
    const q = toQuestion(fromRow(row));
    expect(q.options.filter((o) => o.correct)).toHaveLength(1);
    expect(q.explanation).toEqual({ kk: "", ru: "Потому что", en: "" });
  });

  it("права: учитель правит только свои неопубликованные вопросы", () => {
    const f = fromRow(row);
    expect(canEdit(f, "teacher", "teacher")).toBe(true);
    expect(canEdit(f, "teacher", "other")).toBe(false);
    expect(canEdit({ ...f, status: "published" }, "teacher", "teacher")).toBe(false);
    expect(canEdit({ ...f, status: "published" }, "teacher", "teacher", true)).toBe(true); // доверенный (№94)
    expect(canEdit({ ...f, status: "published" }, "teacher", "other", true)).toBe(false);
    expect(canEdit({ ...f, status: "published" }, "admin", "x")).toBe(true);
    expect(canEdit(newForm("t1"), "teacher", "x")).toBe(true);
    expect(canEdit(f, "student", "teacher")).toBe(false);
  });
});

describe("дерево тем: разделы и порядок", () => {
  const sec = (id: string, sort_order: number): SectionRow =>
    ({ id, subject_id: "s", grade: 5, title_kk: id, title_ru: id, title_en: id, sort_order });
  const top = (id: string, section_id: string | null, sort_order: number): TopicRow =>
    ({ id, subject_id: "s", grade: 5, section_id, title_kk: id, title_ru: id, title_en: id, sort_order });
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

  it("разделы по порядку, темы внутри — по номеру; без раздела и с чужим разделом — в конце", () => {
    const g = groupTopics([sec("B", 1), sec("A", 0)],
      [top("b1", "B", 3), top("old", null, 0), top("a2", "A", 2), top("a1", "A", 1), top("lost", "X", 5)]);
    expect(g.map((x) => x.section?.id ?? null)).toEqual(["A", "B", null]);
    expect(ids(flatTopics(g))).toEqual(["a1", "a2", "b1", "old", "lost"]);
  });

  it("пустой раздел тоже виден; группы «Без раздела» нет, если все темы в разделах", () => {
    const g = groupTopics([sec("A", 0), sec("B", 1)], [top("a1", "A", 0)]);
    expect(g.map((x) => [x.section?.id, x.topics.length])).toEqual([["A", 1], ["B", 0]]);
  });

  it("сквозные номера: сохраняются только изменившиеся", () => {
    const g = groupTopics([sec("A", 0), sec("B", 1)], [top("a1", "A", 0), top("a2", "A", 1), top("b1", "B", 2)]);
    expect(renumber(flatTopics(g))).toEqual([]);
    const moved = g.map((x, k) => (k === 0 ? { ...x, topics: swap(x.topics, 0, 1) } : x));
    expect(renumber(flatTopics(moved)).map((x) => [x.id, x.sort_order])).toEqual([["a2", 0], ["a1", 1]]);
    // раздел B выше раздела A: его тема получает номер 0
    const up = swap(g, 1, -1);
    expect(renumber(up.map((x) => x.section!)).map((x) => [x.id, x.sort_order])).toEqual([["B", 0], ["A", 1]]);
    expect(renumber(flatTopics(up)).map((x) => [x.id, x.sort_order])).toEqual([["b1", 0], ["a1", 1], ["a2", 2]]);
  });
});

describe("адреса экранов админки (№87)", () => {
  it("каждый экран открывается по своему адресу и обратно", async () => {
    const { parsePath, toPath } = await import("../src/admin/route");
    const views = [
      { name: "grade" }, { name: "topics", slug: "math", grade: 5 }, { name: "excel", slug: "math", grade: 5 },
      { name: "topic", topicId: "t1" }, { name: "new", topicId: "t1" }, { name: "edit", id: "q1" },
      { name: "search" }, { name: "translate" }, { name: "my" }, { name: "review" }, { name: "schools" }, { name: "users" },
      { name: "author", id: "u1" },
    ] as const;
    for (const v of views) expect(parsePath(toPath(v))).toEqual(v);
    expect(toPath({ name: "new", topicId: "t1" })).toBe("/admin/questions/topic/t1/new");
    expect(parsePath("/admin")).toEqual({ name: "grade" });
    expect(parsePath("/admin/questions/math/12")).toEqual({ name: "grade" }); // класса 12 нет
  });
});
