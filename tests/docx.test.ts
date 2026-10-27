import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { docxParas, parseTest, readDocx } from "../src/admin/docx";
import {
  detectLang, draftRows, guessColumns, issues, parseKey, sheetToDrafts, suggestTopic, type Draft,
} from "../src/admin/drafts";
import type { TopicRow } from "../src/admin/api";

// Самодельный .docx в формате теста «6 ҚТ 1-57»: абзацы, жирный вопрос, маркированные варианты, ключ в конце.
type P = string | { t: string; b?: boolean; list?: 1 | 2 };
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
function documentXml(ps: P[]) {
  const body = ps.map((x) => {
    const p = typeof x === "string" ? { t: x } : x;
    const num = p.list ? `<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${p.list}"/></w:numPr></w:pPr>` : "";
    const rpr = p.b ? "<w:rPr><w:b/></w:rPr>" : "";
    return `<w:p>${num}<w:r>${rpr}<w:t xml:space="preserve">${p.t}</w:t></w:r></w:p>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><w:document ${NS}><w:body>${body}</w:body></w:document>`;
}
// numId 1 — нумерация 1, 2, 3 (decimal); numId 2 — маркеры (bullet).
const NUMBERING = `<?xml version="1.0"?><w:numbering ${NS}>
  <w:abstractNum w:abstractNumId="10"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
  <w:abstractNum w:abstractNumId="20"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="10"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="20"/></w:num>
</w:numbering>`;
const opts = (...xs: string[]): P[] => xs.map((t) => ({ t, list: 2 }));

const SAMPLE: P[] = [
  "6 ҚТ 1-57",
  "§1. Ежелгі адамдар",
  { t: "1. Тас дәуірі неше кезеңге бөлінеді?", b: true }, ...opts("2", "3", "4", "5"),
  { t: "2. Ең ежелгі тұрақ қай жерде табылған?", b: true }, ...opts("Қаратау", "Алтай", "Маңғыстау"),
  { t: "§38-39. Қазақ хандығы" },
  { t: "Қазақ хандығы қай жылы құрылды?", b: true, list: 1 }, ...opts("1465", "1456", "1500", "1511"),
  { t: "Алғашқы хандар кімдер?", b: true, list: 1 }, ...opts("Керей мен Жәнібек", "Абылай", "Тәуке", "Қасым", "Есім"),
  { t: "5. Бесінші сұрақ", b: true }, ...opts("а", "ә", "б", "в"),
  "$1 1A. 2Д.",
  "$38-39 1C 2В 3 E",
];

describe("Word (.docx)", () => {
  it("абзацы: текст, жирный, вид списка", () => {
    const ps = docxParas(documentXml([{ t: "1. Сұрақ", b: true }, { t: "жауап", list: 2 }, { t: "Сұрақ", list: 1 }]), NUMBERING);
    expect(ps).toEqual([
      { text: "1. Сұрақ", bold: true, list: null },
      { text: "жауап", bold: false, list: "bullet" },
      { text: "Сұрақ", bold: false, list: "decimal" },
    ]);
  });

  it("темы §, вопросы (набранные и автоматические номера), варианты и ключ латиницей и кириллицей", async () => {
    // new Uint8Array: в jsdom TextEncoder отдаёт массив «из другого мира», и fflate принял бы его за папку
    const u8 = (s: string) => new Uint8Array(strToU8(s));
    const file = new File([new Uint8Array(zipSync({ "word/document.xml": u8(documentXml(SAMPLE)), "word/numbering.xml": u8(NUMBERING) }))],
      "6 ҚТ 1-57.docx");
    const { topics, drafts, noKey } = parseTest(await readDocx(file));
    expect(noKey).toBe(false);
    expect(topics).toEqual([
      { key: "1", label: "§1", title: "Ежелгі адамдар" },
      { key: "38-39", label: "§38-39", title: "Қазақ хандығы" },
    ]);
    expect(drafts.map((d) => [d.topic, d.num, d.text, d.options.length, d.correct])).toEqual([
      ["1", 1, "Тас дәуірі неше кезеңге бөлінеді?", 4, 0],
      ["1", 2, "Ең ежелгі тұрақ қай жерде табылған?", 3, null], // «Д» — 4-й вариант, а их 3
      ["38-39", 1, "Қазақ хандығы қай жылы құрылды?", 4, 2],
      ["38-39", 2, "Алғашқы хандар кімдер?", 5, 1],
      ["38-39", 5, "Бесінші сұрақ", 4, null], // в ключе нет 5-го; нумерация сбита: ждали 3
    ]);
    expect(issues(drafts[0])).toEqual([]);
    expect(issues(drafts[1])).toEqual([{ code: "keyOut", letter: "Д" }]);
    expect(issues(drafts[3])).toEqual([{ code: "tooMany", n: 5 }]);
    expect(drafts[4].numbering).toEqual({ found: 5, expected: 3 });
    expect(issues(drafts[4])).toEqual([{ code: "noKey" }]);
  });

  it("нумерация сбита — ошибка, пока правильный ответ не отмечен вручную", () => {
    const { drafts } = parseTest(docxParas(documentXml([
      { t: "1. А?", b: true }, ...opts("x", "y", "z"), { t: "3. Б?", b: true }, ...opts("x", "y", "z"), "$1 1A 3B"])));
    expect(issues(drafts[1])).toEqual([{ code: "numbering", found: 3, expected: 2 }]);
    expect(issues({ ...drafts[1], checked: true })).toEqual([]);
  });

  it("файл без тем: ответы из единственного раздела ключа; вопрос в два жирных абзаца", () => {
    const { topics, drafts } = parseTest(docxParas(documentXml([
      { t: "1. Мәтінді оқы.", b: true }, { t: "Негізгі ой қандай?", b: true }, "A) бір", "B) екі", "C) үш", "$1 1B"])));
    expect(topics).toEqual([{ key: "", label: "", title: "" }]);
    expect(drafts[0]).toMatchObject({ text: "Мәтінді оқы. Негізгі ой қандай?", options: ["бір", "екі", "үш"], correct: 1 });
  });

  it("ключ: разные записи", () => {
    const k = parseKey("$1 1A. 2D. 3 – c $38 – 39 1С,2е");
    expect([...k.entries()].map(([t, m]) => [t, [...m.entries()]])).toEqual([
      ["1", [[1, "A"], [2, "D"], [3, "C"]]], ["38-39", [[1, "С"], [2, "Е"]]]]);
  });
});

describe("проверка и сохранение строк", () => {
  const topic = (id: string, kk: string, ru = kk): TopicRow =>
    ({ id, subject_id: "s", grade: 6, section_id: null, title_kk: kk, title_ru: ru, title_en: "", sort_order: 0 });

  it("язык по буквам", () => {
    expect(detectLang(["Қазақ хандығы қай жылы құрылды?"])).toBe("kk");
    expect(detectLang(["Когда образовалось Казахское ханство?"])).toBe("ru");
    expect(detectLang(["When was it founded?"])).toBe("en");
  });

  it("тема программы — по похожему названию", () => {
    const list = [topic("a", "Тас дәуірі"), topic("b", "Қазақ хандығының құрылуы", "Образование Казахского ханства")];
    expect(suggestTopic("Қазақ хандығы", list)).toBe("b");
    expect(suggestTopic("Тас дәуіріндегі адамдар", list)).toBe("a");
    expect(suggestTopic("Металл", list)).toBeNull();
  });

  it("в базу — только строки без ошибок и с темой; пустые варианты не сохраняются", () => {
    const ok: Draft = { id: "1", topic: "1", num: 1, text: " 2+2? ", options: ["4", "", "5", "3"], correct: 0 };
    const bad: Draft = { ...ok, id: "2", correct: null };
    const other: Draft = { ...ok, id: "3", topic: "2" };
    expect(draftRows([ok, bad, other], { "1": "t1" }, "kk")).toEqual([{
      topic_id: "t1", difficulty: 2, text_kk: "2+2?", explanation_kk: "",
      options: [{ text_kk: "4", is_correct: true }, { text_kk: "5", is_correct: false }, { text_kk: "3", is_correct: false }],
    }]);
  });

  it("Excel со своими столбцами: догадка по названиям; ответ буквой или текстом", () => {
    const head = ["№", "Вопрос", "A", "B", "C", "D", "Правильный ответ", "Тема"];
    const map = guessColumns(head);
    expect(map).toEqual({ topic: 7, text: 1, correct: 6, options: [2, 3, 4, 5], explanation: null });
    const { topics, drafts } = sheetToDrafts([head,
      [1, "2+2?", "3", "4", "5", "", "B", "Сложение"],
      [2, "3+3?", "6", "7", "8", "", "6", "Сложение"],
      [3, "5-1?", "3", "2", "1", "", "4", "Вычитание"],
    ], map);
    expect(topics.map((t) => t.key)).toEqual(["Сложение", "Вычитание"]);
    expect(drafts.map((d) => [d.options, d.correct])).toEqual([
      [["3", "4", "5"], 1], [["6", "7", "8"], 0], [["4", "3", "2", "1"], 0]]);
  });
});
