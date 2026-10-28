// Готовые страницы для Google (DECISIONS.md №101): из каталога и вопросов — HTML-страницы языка, класса,
// предмета и темы, sitemap.xml и robots.txt. Без запросов к базе — их делает scripts/prerender.ts.
import { UI } from "../src/i18n/ui";
import { sitePath, subjectSlug, topicSlugs } from "../src/lib/slug";
import { tx } from "../src/lib/text";
import { LANGS, topicCount, visibleTopics, type Catalog, type Lang, type Question, type Subject, type Topic } from "../src/lib/types";

const SEO = {
  kk: {
    home: "4–11 сыныптарға арналған тегін тесттер | Білімтест",
    grade: (g: number) => `${g}-сынып: тегін тесттер барлық пән бойынша | Білімтест`,
    subject: (g: number, s: string) => `${s}, ${g}-сынып: тақырыптар бойынша тегін тест | Білімтест`,
    topic: (g: number, s: string, t: string) => `${t} — ${s}, ${g}-сынып, тест | Білімтест`,
    topicDesc: (g: number, s: string, t: string, n: number) =>
      `«${t}» тақырыбы бойынша тегін тест: ${s}, ${g}-сынып. ${n} сұрақ, жауап бірден, қателермен жұмыс.`,
    listDesc: (what: string) => `${what}: тегін тесттер, нәтиже бірден. Қазақша, орысша, ағылшынша.`,
    sample: "Тесттен мысал сұрақтар", start: "Тестті бастау", topics: "Тақырыптар",
  },
  ru: {
    home: "Бесплатные тесты для 4–11 классов | Білімтест",
    grade: (g: number) => `${g} класс: бесплатные тесты по всем предметам | Білімтест`,
    subject: (g: number, s: string) => `${s}, ${g} класс: бесплатные тесты по темам | Білімтест`,
    topic: (g: number, s: string, t: string) => `${t} — ${s}, ${g} класс, тест | Білімтест`,
    topicDesc: (g: number, s: string, t: string, n: number) =>
      `Бесплатный тест по теме «${t}»: ${s}, ${g} класс. ${n} вопросов, ответ сразу, работа над ошибками.`,
    listDesc: (what: string) => `${what}: бесплатные тесты, результат сразу. На казахском, русском и английском.`,
    sample: "Примеры вопросов из теста", start: "Начать тест", topics: "Темы",
  },
  en: {
    home: "Free tests for grades 4–11 | Bilimtest",
    grade: (g: number) => `Grade ${g}: free tests in every subject | Bilimtest`,
    subject: (g: number, s: string) => `${s}, grade ${g}: free tests by topic | Bilimtest`,
    topic: (g: number, s: string, t: string) => `${t} — ${s}, grade ${g}, test | Bilimtest`,
    topicDesc: (g: number, s: string, t: string, n: number) =>
      `Free test on “${t}”: ${s}, grade ${g}. ${n} questions, instant answers, work on mistakes.`,
    listDesc: (what: string) => `${what}: free tests with instant results. In Kazakh, Russian and English.`,
    sample: "Sample questions from the test", start: "Start the test", topics: "Topics",
  },
} satisfies Record<Lang, unknown>;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface Page { path: string; lang: Lang; title: string; description: string; body: string; alternates: Partial<Record<Lang, string>> }

/** Встраивает страницу в собранный index.html: язык, заголовок, описание, адреса, разметка внутри #root. */
export function renderPage(template: string, site: string, p: Page): string {
  const head = [
    `<title>${esc(p.title)}</title>`,
    `<meta name="description" content="${esc(p.description)}">`,
    `<link rel="canonical" href="${site}${p.path}">`,
    ...Object.entries(p.alternates).map(([l, path]) => `<link rel="alternate" hreflang="${l}" href="${site}${path}">`),
    `<meta property="og:title" content="${esc(p.title)}">`,
    `<meta property="og:description" content="${esc(p.description)}">`,
    `<meta property="og:url" content="${site}${p.path}">`,
  ].join("\n");
  return template
    .replace(/<html lang="[^"]*">/, `<html lang="${p.lang}">`)
    .replace(/<title>[\s\S]*?<\/title>\s*<meta name="description"[^>]*>/, head)
    .replace(`<div id="root"></div>`, `<div id="root"><main class="seo wrap">${p.body}</main></div>`);
}

const crumbs = (items: [string, string][]) =>
  `<nav class="crumbs">${items.map(([href, name]) => `<a href="${href}">${esc(name)}</a>`).join(" › ")}</nav>`;
const links = (items: [string, string, string?][]) =>
  `<ul class="seo-links">${items.map(([href, name, note]) =>
    `<li><a href="${href}">${esc(name)}</a>${note ? ` <span>${esc(note)}</span>` : ""}</li>`).join("")}</ul>`;

/** Все страницы сайта для Google. samples — несколько вопросов каждой темы (по id темы) на каждом языке. */
export function buildPages(c: Catalog, samples: Partial<Record<Lang, Map<string, Question[]>>>): Page[] {
  const pages: Page[] = [];
  const subj = (s: Subject, l: Lang) => tx(s.name, l);
  for (const l of LANGS) {
    const t = UI[l], seo = SEO[l];
    const shown = visibleTopics(c, l);
    if (!shown.length) continue; // на этом языке пока нечего показать
    const grades = [...new Set(shown.map((tp) => tp.grade))].sort((a, b) => a - b);
    // Есть ли та же страница на другом языке — для hreflang.
    const other = (fn: (l2: Lang) => string | null) =>
      Object.fromEntries(LANGS.map((l2) => [l2, fn(l2)]).filter(([, v]) => v)) as Partial<Record<Lang, string>>;
    const hasGrade = (l2: Lang, g: number) => visibleTopics(c, l2).some((tp) => tp.grade === g);

    pages.push({ path: sitePath(l), lang: l, title: seo.home, description: t.lede,
      alternates: other((l2) => (visibleTopics(c, l2).length ? sitePath(l2) : null)),
      body: `<h1>${esc(t.h1)}</h1><p>${esc(t.lede)}</p>` + links(grades.map((g) => [sitePath(l, g), t.gl(g)])) });

    for (const g of grades) {
      const inGrade = shown.filter((tp) => tp.grade === g);
      const subjects = c.subjects.filter((s) => inGrade.some((tp) => tp.subjectId === s.id)).sort((a, b) => a.sort - b.sort);
      pages.push({ path: sitePath(l, g), lang: l, title: seo.grade(g), description: seo.listDesc(t.gl(g)),
        alternates: other((l2) => (hasGrade(l2, g) ? sitePath(l2, g) : null)),
        body: crumbs([[sitePath(l), "Білімтест"]]) + `<h1>${esc(t.gl(g))}</h1>` +
          links(subjects.map((s) => [sitePath(l, g, subjectSlug(s)), subj(s, l),
            `${inGrade.filter((tp) => tp.subjectId === s.id).length} ${t.topics}`])) });

      for (const s of subjects) {
        const topics = inGrade.filter((tp) => tp.subjectId === s.id);
        const slugs = topicSlugs(topics, l);
        const sPath = sitePath(l, g, subjectSlug(s));
        const sName = subj(s, l);
        const has = (l2: Lang) => visibleTopics(c, l2).some((tp) => tp.grade === g && tp.subjectId === s.id);
        pages.push({ path: sPath, lang: l, title: seo.subject(g, sName), description: seo.listDesc(`${sName}, ${t.gl(g)}`),
          alternates: other((l2) => (has(l2) ? sitePath(l2, g, subjectSlug(s)) : null)),
          body: crumbs([[sitePath(l), "Білімтест"], [sitePath(l, g), t.gl(g)]]) + `<h1>${esc(sName)} · ${esc(t.gl(g))}</h1>` +
            `<h2>${esc(seo.topics)}</h2>` + links(topics.sort((a, b) => a.sort - b.sort)
              .map((tp) => [sitePath(l, g, subjectSlug(s), slugs.get(tp.id)), tx(tp.title, l), `${topicCount(tp, l)} ${t.qs}`])) });

        for (const tp of topics) pages.push(topicPage(c, tp, s, l, slugs.get(tp.id)!, samples[l]?.get(tp.id) ?? []));
      }
    }
  }
  return pages;
}

function topicPage(c: Catalog, tp: Topic, s: Subject, l: Lang, slug: string, qs: Question[]): Page {
  const t = UI[l], seo = SEO[l];
  const g = tp.grade, sName = tx(s.name, l), title = tx(tp.title, l), n = topicCount(tp, l);
  const path = sitePath(l, g, subjectSlug(s), slug);
  const alternates: Partial<Record<Lang, string>> = {};
  for (const l2 of LANGS) {
    const same = visibleTopics(c, l2).filter((x) => x.grade === g && x.subjectId === s.id);
    if (same.some((x) => x.id === tp.id)) alternates[l2] = sitePath(l2, g, subjectSlug(s), topicSlugs(same, l2).get(tp.id));
  }
  // Варианты — по алфавиту: в базе правильный часто первый, страница не должна подсказывать ответ.
  const sample = qs.slice(0, 5).map((q) => `<li><p>${esc(tx(q.text, l))}</p><ul>${q.options
    .map((o) => tx(o.text, l)).sort((a, b) => a.localeCompare(b)).map((o) => `<li>${esc(o)}</li>`).join("")}</ul></li>`).join("");
  return {
    path, lang: l, alternates, title: seo.topic(g, sName, title), description: seo.topicDesc(g, sName, title, n),
    body: crumbs([[sitePath(l), "Білімтест"], [sitePath(l, g), t.gl(g)], [sitePath(l, g, subjectSlug(s)), sName]]) +
      `<h1>${esc(title)}</h1><p>${esc(seo.topicDesc(g, sName, title, n))}</p>` +
      `<p><a class="btn" href="${path}">${esc(seo.start)}</a></p>` +
      (sample ? `<h2>${esc(seo.sample)}</h2><ol class="seo-q">${sample}</ol>` : ""),
  };
}

export function sitemap(site: string, pages: Page[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    pages.map((p) => `<url><loc>${site}${p.path}</loc></url>`).join("\n") + "\n</urlset>\n";
}

export const robots = (site: string) =>
  `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /login\nDisallow: /me\nSitemap: ${site}/sitemap.xml\n`;
