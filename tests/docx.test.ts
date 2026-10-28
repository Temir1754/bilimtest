import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { docxParas, parseTest, readDocx } from "../src/admin/docx";
import { sampleDocx, samplePath } from "../scripts/sample-docx";
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
      ["38-39", 5, "Бесінші сұрақ", 4, null], // нумерация сбита (ждали 3); ответ — 3-й по порядку: «E», а вариантов 4
    ]);
    expect(issues(drafts[0])).toEqual([]);
    expect(issues(drafts[1])).toEqual([{ code: "keyOut", letter: "Д" }]);
    expect(issues(drafts[3])).toEqual([{ code: "tooMany", n: 5 }]);
    expect(drafts[4].numbering).toEqual({ found: 5, expected: 3 });
    expect(issues(drafts[4])).toEqual([{ code: "keyOut", letter: "E" }]);
  });

  it("нумерация сбита — ошибка, пока правильный ответ не отмечен вручную", () => {
    const { drafts } = parseTest(docxParas(documentXml([
      { t: "1. А?", b: true }, ...opts("x", "y", "z"), { t: "3. Б?", b: true }, ...opts("x", "y", "z"), "$1 1A 2B"])));
    expect(drafts[1].correct).toBe(1); // ответ — по порядку вопроса в теме
    expect(issues(drafts[1])).toEqual([{ code: "numbering", found: 3, expected: 2 }]);
    expect(issues({ ...drafts[1], checked: true })).toEqual([]);
  });

  it("файл без тем: ответы из единственного раздела ключа; вопрос в два жирных абзаца", () => {
    const { topics, drafts } = parseTest(docxParas(documentXml([
      { t: "1. Мәтінді оқы.", b: true }, { t: "Негізгі ой қандай?", b: true }, "A) бір", "B) екі", "C) үш", "$1 1B"])));
    expect(topics).toEqual([{ key: "", label: "", title: "" }]);
    expect(drafts[0]).toMatchObject({ text: "Мәтінді оқы. Негізгі ой қандай?", options: ["бір", "екі", "үш"], correct: 1 });
  });

  it("ловушки настоящего файла «6 ҚТ 1-57»", () => {
    const q = (n: number, b = true) => [{ t: `${n}. Сұрақ ${n}`, b }, ...opts("a", "b", "c", "d")];
    const { topics, drafts } = parseTest(docxParas(documentXml([
      { t: "6 ҚТ 1-57", b: true }, // название файла до первой темы
      "§31. Отыз бірінші", ...q(1), ...q(2),
      "§33. Отыз үшінші", ...q(1), ...q(2),
      "§34. Ноғай Ордасы", ...[1, 2, 3, 4, 5, 6, 7].flatMap((n) => q(n)), "8 Ноғай Ордасы құрылды", ...opts("1440", "1465", "1500", "1511"),
      "§35. Нумерация", ...[1, 2, 3, 4, 5, 6, 8, 9, 10].flatMap((n) => q(n)),
      "§40-41. Екі тақырып", ...q(1), ...q(2), ...q(3),
      "§46. Есім хан", { t: "Есiм хан (1598–1628 ж.)", b: true }, ...q(1),
      { t: "6 ҚТ 1-57 тақырыптық тест жауаптары", b: true },
      "$31 11A. 2D.", "$33 1С. 2А.", "$34 1A 2A 3A 4A 5A 6A 7B 8C", "$35 1A 2A 3A 4A 5A 6A 7B 8C 9D", "$40-41 1A 2B 3.D", "$46 1B",
    ])));
    expect(topics.map((t) => [t.key, t.title])).toEqual([["31", "Отыз бірінші"], ["33", "Отыз үшінші"], ["34", "Ноғай Ордасы"],
      ["35", "Нумерация"], ["40-41", "Екі тақырып"], ["46", "Есім хан Есiм хан (1598–1628 ж.)"]]);
    const by = (k: string) => drafts.filter((d) => d.topic === k);
    expect(by("31").map((d) => d.correct)).toEqual([0, 3]); // «11A» — это 1A
    expect(by("33").map((d) => d.correct)).toEqual([2, 0]); // кириллица
    expect(by("34").slice(6).map((d) => [d.text, d.options.length, d.correct, d.numbering])).toEqual([
      ["Сұрақ 7", 4, 1, undefined], ["Ноғай Ордасы құрылды", 4, 2, undefined]]); // «8 …» без точки — отдельный вопрос
    const n35 = by("35");
    expect(n35.map((d) => d.correct)).toEqual([0, 0, 0, 0, 0, 0, 1, 2, 3]); // по порядку: «8» берёт 7-й ответ
    expect(n35.filter((d) => issues(d).some((x) => x.code === "numbering")).map((d) => d.num)).toEqual([8, 9, 10]);
    expect(by("40-41").map((d) => d.correct)).toEqual([0, 1, 3]); // «3.D»
    expect(by("46").map((d) => d.text)).toEqual(["Сұрақ 1"]); // подзаголовок — не вопрос
    expect(drafts).toHaveLength(2 + 2 + 8 + 9 + 3 + 1); // «… жауаптары» — не вопрос
  });

  it("жирный вариант в списке — вариант, а не продолжение вопроса; жирный «8 …» без точки — номер не в тексте", () => {
    const { drafts } = parseTest(docxParas(documentXml([
      { t: "1. Руна жазуларының саны:", b: true }, { t: "250-ден астам", b: true, list: 2 }, ...opts("350", "400", "150"),
      { t: "2 Ноғай Ордасы құрылды", b: true }, ...opts("Еділ", "Мауреннахр", "Маңғыстау"), "$1 1A 2A",
    ]), NUMBERING));
    expect(drafts.map((d) => [d.text, d.options.length])).toEqual([["Руна жазуларының саны:", 4], ["Ноғай Ордасы құрылды", 3]]);
  });

  it("ключ: разные записи", () => {
    const k = parseKey("$1 1A. 2D. 3 – c $38 – 39 1С,2е $31 11A. 2D.");
    expect([...k.entries()].map(([t, m]) => [t, [...m.entries()]])).toEqual([
      ["1", [[1, "A"], [2, "D"], [3, "C"]]], ["38-39", [[1, "С"], [2, "Е"]]], ["31", [[1, "A"], [2, "D"]]]]);
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

describe("образцы Word для учителей (№114)", () => {
  it.each(["kk", "ru", "en"] as const)("public/samples/ulgi-%s.docx читается без ошибок и совпадает со скриптом", async (lang) => {
    const bytes = readFileSync(samplePath(lang));
    expect(new Uint8Array(bytes)).toEqual(sampleDocx(lang)); // после правки текста — npm run samples
    const { topics, drafts, noKey } = parseTest(await readDocx(new File([new Uint8Array(bytes)], `ulgi-${lang}.docx`)));
    expect(noKey).toBe(false);
    expect(topics.map((t) => t.label)).toEqual(["§1", "§2"]);
    expect(drafts).toHaveLength(5);
    expect(drafts.map((d) => [d.options.length, issues(d)])).toEqual([[4, []], [4, []], [4, []], [4, []], [3, []]]);
    // правильные ответы — на разных местах, а не все «A»
    expect(drafts.map((d) => d.correct)).toEqual([0, 2, 1, 3, 0]);
    expect(drafts.every((d) => ["42", "100", "3/4", "1/2"].includes(d.options[d.correct!]))).toBe(true);
  });
});
