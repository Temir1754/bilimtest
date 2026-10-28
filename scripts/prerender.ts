// После сборки (npm run build): готовые страницы для Google в dist/ — /{язык}/{класс}/{предмет}/{тема}/index.html,
// sitemap.xml и robots.txt (DECISIONS.md №101). Данные — из базы теми же функциями, что у сайта.
// База недоступна или нет настроек — предупреждение, сборка не падает (сайт работает и без этих страниц).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dbSource } from "../src/lib/dbSource";
import { LANGS, visibleTopics, type Lang, type Question } from "../src/lib/types";
import { ROOT } from "./env";
import { buildPages, renderPage, robots, sitemap } from "./seo";

const SITE = (process.env.SITE_URL?.trim() || "https://bilimtest-chi.vercel.app").replace(/\/+$/, "");
const url = process.env.VITE_SUPABASE_URL?.trim();
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const dist = join(ROOT, "dist");

async function main() {
  if (!url || !key) {
    console.warn("prerender: нет VITE_SUPABASE_URL или ключа — страницы для Google не созданы");
    return;
  }
  const src = dbSource(url, key);
  const catalog = await src.catalog();
  const samples: Partial<Record<Lang, Map<string, Question[]>>> = {};
  for (const l of LANGS) {
    const ids = visibleTopics(catalog, l).map((tp) => tp.id);
    const map = new Map<string, Question[]>();
    for (let i = 0; i < ids.length; i += 100) {
      for (const q of await src.questions(ids.slice(i, i + 100), l)) {
        const list = map.get(q.topicId) ?? [];
        if (list.length < 5) list.push(q);
        map.set(q.topicId, list);
      }
    }
    samples[l] = map;
  }

  const template = readFileSync(join(dist, "index.html"), "utf8");
  const pages = buildPages(catalog, samples);
  for (const p of pages) {
    const dir = join(dist, ...p.path.split("/").filter(Boolean));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), renderPage(template, SITE, p));
  }
  writeFileSync(join(dist, "sitemap.xml"), sitemap(SITE, pages));
  writeFileSync(join(dist, "robots.txt"), robots(SITE));
  console.log(`prerender: ${pages.length} страниц для Google, sitemap.xml, robots.txt`);
}

main().catch((e) => console.warn("prerender: страницы для Google не созданы —", e instanceof Error ? e.message : e));
