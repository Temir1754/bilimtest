// Страницы для Google (DECISIONS.md №101): адреса тем, разбор адреса, готовые страницы и sitemap.
import { describe, expect, it } from "vitest";
import { buildPages, renderPage, robots, sitemap } from "../scripts/seo";
import { parsePath, resolvePlace, slugify, topicSlugs } from "../src/lib/slug";
import type { Catalog, Question } from "../src/lib/types";

const topic = (id: string, title: string, sort: number, ready = { kk: 12, ru: 12, en: 0 }) => ({
  id, subjectId: "s1", grade: 6, sectionId: null, title: { kk: title, ru: title, en: title }, sort, questionCount: 12, ready });
const catalog: Catalog = {
  min: 10,
  subjects: [{ id: "s1", slug: "histkz", icon: "", name: { kk: "Қазақстан тарихы", ru: "История Казахстана", en: "History" }, onlyLang: null, sort: 0 }],
  sections: [],
  topics: [topic("t1", "Түрік қағанатының құрылуы", 0), topic("t2", "Түрік қағанатының құрылуы", 1),
    topic("t3", "Әл-Фараби", 2, { kk: 12, ru: 3, en: 0 })],
};
const q: Question = { id: "q1", topicId: "t1", text: { kk: "Қағанаттың астанасы?" }, explanation: null, imageUrl: null,
  options: [{ text: { kk: "Суяб" }, correct: true }, { text: { kk: "Отырар" }, correct: false }, { text: { kk: "Алтай" }, correct: false }] };
const template = `<!doctype html>\n<html lang="kk">\n<head>\n<title>Білімтест</title>\n<meta name="description" content="x">\n</head>\n<body>\n<div id="root"></div>\n</body>\n</html>`;

describe("адреса страниц", () => {
  it("латиница из казахского названия; одинаковые названия — с номером", () => {
    expect(slugify("Түрік қағанатының құрылуы")).toBe("turik-qaganatynyn-quryluy");
    expect(slugify("IX–XIII ғасырдағы ғылым")).toBe("ix-xiii-gasyrdagy-gylym");
    expect([...topicSlugs(catalog.topics, "kk").values()]).toEqual(["turik-qaganatynyn-quryluy", "turik-qaganatynyn-quryluy-2", "al-farabi"]);
  });

  it("разбор адреса и поиск темы; тема, скрытая на языке адреса, не находится", () => {
    const p = parsePath("/kk/6/histkz/al-farabi/")!;
    expect(p).toEqual({ lang: "kk", grade: 6, subject: "histkz", topic: "al-farabi" });
    expect(resolvePlace(catalog, p)).toEqual({ subject: catalog.subjects[0], topicId: "t3" });
    expect(resolvePlace(catalog, parsePath("/ru/6/histkz/al-farabi")!).topicId).toBeNull(); // на русском 3 вопроса
    expect(parsePath("/admin/questions")).toBeNull();
  });
});

describe("готовые страницы", () => {
  const pages = buildPages(catalog, { kk: new Map([["t1", [q]]]) });

  it("язык, класс, предмет, темы — только видимые на языке; английского нет", () => {
    const paths = pages.map((p) => p.path);
    expect(paths).toContain("/kk/6/histkz/al-farabi/");
    expect(paths).toContain("/ru/6/histkz/turik-qaganatynyn-quryluy/");
    expect(paths).not.toContain("/ru/6/histkz/al-farabi/");
    expect(paths.some((x) => x.startsWith("/en/"))).toBe(false);
  });

  it("страница темы: заголовок, описание, ссылки на другие языки, примеры без подсказки ответа", () => {
    const p = pages.find((x) => x.path === "/kk/6/histkz/turik-qaganatynyn-quryluy/")!;
    const html = renderPage(template, "https://bilimtest.kz", p);
    expect(html).toContain(`<html lang="kk">`);
    expect(html).toContain("<title>Түрік қағанатының құрылуы — Қазақстан тарихы, 6-сынып, тест | Білімтест</title>");
    expect(html).toContain(`<link rel="canonical" href="https://bilimtest.kz/kk/6/histkz/turik-qaganatynyn-quryluy/">`);
    expect(html).toContain(`hreflang="ru" href="https://bilimtest.kz/ru/6/histkz/turik-qaganatynyn-quryluy/"`);
    expect(html).toContain("<ul><li>Алтай</li><li>Отырар</li><li>Суяб</li></ul>"); // по алфавиту, не правильный первым
  });

  it("sitemap и robots", () => {
    expect(sitemap("https://bilimtest.kz", pages)).toContain("<loc>https://bilimtest.kz/kk/6/histkz/al-farabi/</loc>");
    expect(robots("https://bilimtest.kz")).toContain("Disallow: /admin");
  });
});
