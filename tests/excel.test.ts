import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { EXPORT_HEADERS, HEADERS, exportSheet, parseSheet, templateSheets, toImportRows } from "../src/admin/excel";
import type { QuestionRow } from "../src/admin/form";

const q: QuestionRow = {
  id: "q1", topic_id: "t1", text_kk: "2+2?", text_ru: "2+2?", text_en: "2+2?",
  explanation_kk: null, explanation_ru: "Счёт", explanation_en: null, image_url: null, difficulty: 1,
  status: "published", review_comment: null, author_id: null,
  // правильный ответ не первый — в выгрузке он должен встать первым
  options: [
    { sort_order: 0, is_correct: false, text_kk: "5", text_ru: "5", text_en: "5" },
    { sort_order: 1, is_correct: true, text_kk: "4", text_ru: "4", text_en: "4" },
    { sort_order: 2, is_correct: false, text_kk: "3", text_ru: "3", text_en: "3" },
  ],
};

/** Как настоящий файл: лист → .xlsx → снова лист. */
function throughXlsx(aoa: unknown[][]): unknown[][] {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Вопросы");
  const back = XLSX.read(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
  return XLSX.utils.sheet_to_json(back.Sheets[back.SheetNames[0]], { header: 1, defval: "", raw: true });
}

describe("Excel", () => {
  it("шаблон читается без ошибок: пример — один готовый вопрос", () => {
    const { rows, problems } = parseSheet(throughXlsx(templateSheets()["Вопросы"]), null);
    expect(problems).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ line: 2, topic: "Обыкновенные дроби", difficulty: 1, errors: [], warnings: [] });
    expect(rows[0].options.map((o) => [o.text.ru, o.correct])).toEqual([["1", true], ["1/2", false], ["4/8", false]]);
  });

  it("выгрузка → загрузка: тот же вопрос, правильный ответ первым", () => {
    const sheet = exportSheet([{ topic: "Счёт", q }]);
    expect(sheet[0]).toEqual(EXPORT_HEADERS);
    const [r] = toImportRows(parseSheet(throughXlsx(sheet), null).rows);
    expect(r).toMatchObject({ topic: "Счёт", text_ru: "2+2?", explanation_ru: "Счёт", explanation_en: "", difficulty: 1 });
    expect((r.options as { text_ru: string; is_correct: boolean }[]).map((o) => [o.text_ru, o.is_correct]))
      .toEqual([["4", true], ["5", false], ["3", false]]);
  });

  it("числа из ячеек становятся текстом", () => {
    const row = ["Счёт", "2+2?", "2+2?", "2+2?", 4, 4, 4, 5, 5, 5, 3, 3, 3, "", "", "", "", "", "", 2];
    const [r] = parseSheet([HEADERS, row], null).rows;
    expect(r.options[0].text).toEqual({ kk: "4", ru: "4", en: "4" });
    expect(r.errors).toEqual([]);
  });

  it("ошибки и замечания по строкам; пустые строки пропускаются", () => {
    const blank = HEADERS.map(() => "");
    const noEn = ["Т", "С", "В", "", "a", "a", "", "b", "b", "", "c", "c", "", "", "", "", "", "", "", ""];
    const broken = ["", "", "", "", "a", "a", "a", "", "", "", "", "", "", "", "", "", "", "", "", "7"];
    const { rows } = parseSheet([HEADERS, blank, noEn, broken], null);
    expect(rows.map((r) => r.line)).toEqual([3, 4]);
    expect(rows[0].warnings).toEqual(["не хватает текста на EN"]);
    expect(parseSheet([HEADERS, noEn], "ru").rows[0].warnings).toEqual([]); // языковой предмет: нужен только RU
    expect(rows[1].errors).toEqual(["не указана тема", "нет текста вопроса", "нужно минимум 2 неверных ответа",
      "сложность должна быть 1, 2 или 3"]);
    expect(toImportRows(rows)).toHaveLength(1);
  });

  it("чужая таблица без столбцов шаблона — понятная ошибка", () => {
    expect(parseSheet([["Имя", "Фамилия"], ["А", "Б"]], null).problems[0]).toMatch(/Скачайте шаблон/);
  });
});
