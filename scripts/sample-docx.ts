// Образец теста в Word для учителей (DECISIONS.md №114): public/samples/ulgi-kk.docx, -ru, -en.
//   npm run samples — пересобрать файлы (после правки текста ниже)
// Формат — тот, что понимает загрузка (src/admin/docx.ts): «§1. Тема», жирный «1. Вопрос», варианты «A) …»,
// в конце ключ «$1 1A. 2B.». Тест tests/docx.test.ts проверяет, что образцы читаются без ошибок.
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import type { Lang } from "../src/lib/types";

type Q = [question: string, ...options: string[]]; // первый вариант — правильный; в файле он стоит на месте из ключа

interface Sample { title: string; help: string[]; topics: { title: string; questions: Q[] }[]; keyTitle: string }

const SAMPLES: Record<Lang, Sample> = {
  kk: {
    title: "5-сынып, математика — үлгі тест",
    help: [
      "Осы пішімде жазыңыз: «§» — тақырып, қалың әріппен «1.» — сұрақ, астында 3–4 жауап нұсқасы.",
      "Файлдың соңында — жауап кілті: әр тақырыптың нөмірі, сосын сұрақ нөмірі мен дұрыс жауаптың әрпі.",
      "Бұл абзацтарды өшіріп, өз сұрақтарыңызды жазыңыз. Бірінші «§» дейінгі мәтін жүктелмейді.",
    ],
    topics: [
      { title: "Натурал сандар", questions: [
        ["25 + 17 = ?", "42", "32", "41", "52"],
        ["Ең кіші үш таңбалы сан қайсы?", "100", "99", "101", "111"],
        ["6 · 7 = ?", "42", "48", "36", "49"],
      ] },
      { title: "Жай бөлшектер", questions: [
        ["1/2 + 1/4 = ?", "3/4", "2/6", "1/6", "2/4"],
        ["Қай бөлшек ең үлкен?", "1/2", "1/3", "1/4"],
      ] },
    ],
    keyTitle: "Тест жауаптары",
  },
  ru: {
    title: "5 класс, математика — образец теста",
    help: [
      "Пишите в таком виде: «§» — тема, жирным «1.» — вопрос, под ним 3–4 варианта ответа.",
      "В конце файла — ключ ответов: номер темы, затем номер вопроса и буква правильного ответа.",
      "Удалите эти абзацы и впишите свои вопросы. Текст до первого «§» не загружается.",
    ],
    topics: [
      { title: "Натуральные числа", questions: [
        ["25 + 17 = ?", "42", "32", "41", "52"],
        ["Какое самое маленькое трёхзначное число?", "100", "99", "101", "111"],
        ["6 · 7 = ?", "42", "48", "36", "49"],
      ] },
      { title: "Обыкновенные дроби", questions: [
        ["1/2 + 1/4 = ?", "3/4", "2/6", "1/6", "2/4"],
        ["Какая дробь самая большая?", "1/2", "1/3", "1/4"],
      ] },
    ],
    keyTitle: "Ответы к тесту",
  },
  en: {
    title: "Grade 5, math — sample test",
    help: [
      "Write in this format: «§» is a topic, a bold «1.» is a question, with 3–4 answer options below it.",
      "At the end of the file there is an answer key: the topic number, then the question number and the letter of the correct answer.",
      "Delete these paragraphs and write your own questions. Text before the first «§» is not uploaded.",
    ],
    topics: [
      { title: "Natural numbers", questions: [
        ["25 + 17 = ?", "42", "32", "41", "52"],
        ["What is the smallest three-digit number?", "100", "99", "101", "111"],
        ["6 · 7 = ?", "42", "48", "36", "49"],
      ] },
      { title: "Fractions", questions: [
        ["1/2 + 1/4 = ?", "3/4", "2/6", "1/6", "2/4"],
        ["Which fraction is the largest?", "1/2", "1/3", "1/4"],
      ] },
    ],
    keyTitle: "Answer key",
  },
};

const LETTERS = "ABCD";
/** Место правильного ответа: по кругу A, C, B, D… — чтобы в образце не все ответы были «A». */
const place = (i: number) => [0, 2, 1, 3][i % 4];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const para = (text: string, bold = false) =>
  `<w:p><w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;

export function sampleDocx(lang: Lang): Uint8Array {
  const s = SAMPLES[lang];
  const body: string[] = [para(s.title, true), ...s.help.map((h) => para(h)), para("")];
  const key: string[] = [];
  let n = 0;
  s.topics.forEach((t, ti) => {
    body.push(para(`§${ti + 1}. ${t.title}`, true));
    const answers: string[] = [];
    t.questions.forEach(([q, right, ...wrong], qi) => {
      const at = Math.min(place(n++), wrong.length);
      const options = [...wrong.slice(0, at), right, ...wrong.slice(at)];
      body.push(para(`${qi + 1}. ${q}`, true), ...options.map((o, oi) => para(`${LETTERS[oi]}) ${o}`)));
      answers.push(`${qi + 1}${LETTERS[at]}.`);
    });
    key.push(`$${ti + 1} ${answers.join(" ")}`);
  });
  body.push(para(""), para(s.keyTitle, true), ...key.map((k) => para(k)));

  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body.join("")}</w:body></w:document>`,
  };
  // Фиксированное время в архиве — файл не меняется при повторной сборке. new Uint8Array — для тестов в jsdom
  // (TextEncoder там отдаёт массив «из другого мира», и fflate принял бы его за папку).
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [new Uint8Array(strToU8(v)), { mtime: new Date("2026-10-28") }]])));
}

export const samplePath = (lang: Lang) => join(import.meta.dirname, "..", "public", "samples", `ulgi-${lang}.docx`);

if (process.argv[1]?.endsWith("sample-docx.ts")) {
  mkdirSync(join(import.meta.dirname, "..", "public", "samples"), { recursive: true });
  for (const l of ["kk", "ru", "en"] as const) {
    writeFileSync(samplePath(l), sampleDocx(l));
    console.log(`  public/samples/ulgi-${l}.docx`);
  }
}
