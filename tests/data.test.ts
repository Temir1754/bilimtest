import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { convertSubject, validateSubject, type RawSubject } from "../src/lib/legacy";
import { localSource } from "../src/lib/localSource";
import { parseMath, tx } from "../src/lib/text";

const dir = join(__dirname, "..", "data");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

describe("data/*.json", () => {
  it.each(files)("%s проходит проверку", (f) => {
    const raw = JSON.parse(readFileSync(join(dir, f), "utf8")) as RawSubject;
    expect(validateSubject(f.replace(".json", ""), raw)).toEqual([]);
  });

  it("всего 16 предметов, 267 тем, 1336 вопросов", async () => {
    const cat = await localSource.catalog();
    expect(cat.subjects).toHaveLength(16);
    expect(cat.topics).toHaveLength(267);
    expect(cat.topics.reduce((n, t) => n + t.questionCount, 0)).toBe(1336);
    const qs = await localSource.questions(cat.topics.map((t) => t.id), "ru");
    expect(qs).toHaveLength(1336);
    expect(qs.every((q) => q.options.filter((o) => o.correct).length === 1)).toBe(true);
  });

  it("порядок предметов как на старом сайте", async () => {
    const cat = await localSource.catalog();
    expect(cat.subjects.slice(0, 3).map((s) => s.id)).toEqual(["math", "algebra", "geometry"]);
    expect(cat.subjects.at(-1)!.id).toBe("english");
  });
});

describe("convertSubject и validateSubject", () => {
  const raw: RawSubject = {
    id: "x", icon: "X", name: ["Х", "Икс", "Ex"], lang: "kk",
    grades: { "5": [[["Т", "Тема", "Topic"], Array.from({ length: 5 }, (_, i) => [`В${i}`, "a", "b", "c"])]] },
  };

  it("правильный ответ первый, строка копируется во все языки, id = legacy_key", () => {
    const { subject, topics, questions } = convertSubject(raw, 0);
    expect(subject.onlyLang).toBe("kk");
    expect(topics[0]).toMatchObject({ id: "x|5|0", grade: 5, questionCount: 5 });
    expect(questions[2].id).toBe("x|5|0|2");
    expect(questions[0].options[0]).toEqual({ text: { kk: "a", ru: "a", en: "a" }, correct: true });
  });

  it("находит ошибки", () => {
    const bad: RawSubject = { ...raw, grades: { "3": [[["", "", ""], [["В", "a", "a", "b"]]]] } };
    const errs = validateSubject("y", bad);
    expect(errs.some((e) => e.includes("id mismatch"))).toBe(true);
    expect(errs.some((e) => e.includes("grade 3"))).toBe(true);
    expect(errs.some((e) => e.includes("only 1 questions"))).toBe(true);
    expect(errs.some((e) => e.includes("duplicate options"))).toBe(true);
  });
});

describe("текст и формулы", () => {
  it("выбирает язык, иначе первый доступный; в английском десятичная точка", () => {
    expect(tx({ kk: "а", ru: "б" }, "ru")).toBe("б");
    expect(tx({ kk: "а" }, "en")).toBe("а");
    expect(tx({ en: "2,5 m" }, "en")).toBe("2.5 m");
    expect(tx({ ru: "2,5 м" }, "ru")).toBe("2,5 м");
  });

  it("находит формулы \\( \\) и \\[ \\], но не трогает $A$1", () => {
    expect(parseMath("Найди \\(x^2\\) и \\[y\\]")).toEqual([
      { math: false, text: "Найди " },
      { math: true, text: "x^2", display: false },
      { math: false, text: " и " },
      { math: true, text: "y", display: true },
    ]);
    expect(parseMath("=$A$1+B2")).toEqual([{ math: false, text: "=$A$1+B2" }]);
  });
});
