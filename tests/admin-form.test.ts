import { describe, expect, it } from "vitest";
import {
  canEdit, copyFromRu, fromRow, newForm, publishProblems, saveProblems, toPayload, toQuestion, type QuestionRow,
} from "../src/admin/form";

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

  it("перед публикацией находит то же, что проверяет база", () => {
    const f = fromRow(row);
    expect(publishProblems(f, null)).toEqual([
      "Нет текста вопроса на английском языке.",
      "Нет текста варианта A, B, C на английском языке.",
    ]);
    // У языкового предмета (русский язык) нужен только русский.
    expect(publishProblems(f, "ru")).toEqual([]);
    const two = { ...f, options: f.options.slice(0, 2).map((o) => ({ ...o, correct: false })) };
    expect(publishProblems(two, "ru")).toEqual(["Нужно 3 или 4 варианта ответа, сейчас 2.", "Отметьте ровно один правильный ответ."]);
  });

  it("черновик можно сохранить незаконченным, но не пустым", () => {
    const f = newForm("t1");
    expect(saveProblems(f)).toEqual(["Напишите текст вопроса хотя бы на одном языке."]);
    expect(saveProblems({ ...f, text: { kk: "", ru: "x", en: "" } })).toEqual([]);
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
    expect(canEdit({ ...f, status: "published" }, "admin", "x")).toBe(true);
    expect(canEdit(newForm("t1"), "teacher", "x")).toBe(true);
    expect(canEdit(f, "student", "teacher")).toBe(false);
  });
});
