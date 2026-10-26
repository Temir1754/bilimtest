// Загрузка программы класса (data/curriculum/gradeN.json) в базу: предметы, разделы, темы.
// Вопросы не трогаются. Работает с любым подключением, у которого есть query(sql, params),
// как и importer.ts: с облачной базой (scripts/load-curriculum.ts) и с PGlite в тестах.
//
// Повторный запуск не создаёт дублей: предмет узнаётся по id, раздел и тема — по названию на любом языке
// внутри предмета и класса. Порядок и привязка темы к разделу всегда берутся из файла; названия
// существующих разделов и тем по умолчанию не меняются (могли поправить в админке), с force: true — меняются.
import type { Db } from "./importer";

type T3 = [string, string, string]; // kk, ru, en

export interface Curriculum {
  grade: number;
  note?: string;
  subjects: {
    id: string;
    name: T3;
    icon?: string; // для нового предмета; по умолчанию — первая буква русского названия
    lang?: "kk" | "ru" | "en"; // языковой предмет: вопросы только на этом языке
    sections: { title: T3; topics: T3[] }[];
  }[];
}

export interface CurriculumReport {
  subjects: { created: string[]; existing: string[] };
  sections: { created: number; updated: number };
  topics: { created: number; updated: number };
}

const isT3 = (v: unknown): v is T3 =>
  Array.isArray(v) && v.length === 3 && v.every((s) => typeof s === "string" && s.trim() !== "");
const key = (s: string) => s.trim().toLowerCase().replace(/ё/g, "е");

/** Ошибки в файле программы; пустой список — файл в порядке. */
export function validateCurriculum(c: Curriculum): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(c?.grade) || c.grade < 4 || c.grade > 11) errors.push("grade: нужен класс от 4 до 11");
  if (!Array.isArray(c?.subjects) || !c.subjects.length) return [...errors, "subjects: нет предметов"];
  const ids = new Set<string>();
  for (const s of c.subjects) {
    const w = `предмет ${s.id ?? "?"}`;
    if (!/^[a-z0-9_-]{1,40}$/.test(s.id ?? "")) errors.push(`${w}: id — латиница, цифры, _ или -`);
    if (ids.has(s.id)) errors.push(`${w}: повторяется`);
    ids.add(s.id);
    if (!isT3(s.name)) errors.push(`${w}: name — три непустых названия (kk, ru, en)`);
    if (s.lang && !["kk", "ru", "en"].includes(s.lang)) errors.push(`${w}: lang — kk, ru или en`);
    if (s.icon && s.icon.length > 8) errors.push(`${w}: icon — не длиннее 8 символов`);
    if (!Array.isArray(s.sections) || !s.sections.length) { errors.push(`${w}: нет разделов`); continue; }
    const seen = new Set<string>();
    s.sections.forEach((sec, i) => {
      const ws = `${w}, раздел ${i + 1}`;
      if (!isT3(sec.title)) errors.push(`${ws}: title — три непустых названия`);
      if (!Array.isArray(sec.topics) || !sec.topics.length) { errors.push(`${ws}: нет тем`); return; }
      sec.topics.forEach((tp, j) => {
        if (!isT3(tp)) { errors.push(`${ws}, тема ${j + 1}: три непустых названия`); return; }
        // Темы ищутся по названию — одинаковые названия внутри предмета запутали бы повторную загрузку.
        // Внутри одной темы названия могут совпадать (например, «Present Simple» на всех языках).
        const own = new Set(tp.map(key));
        for (const k of own) if (seen.has(k)) errors.push(`${ws}, тема ${j + 1}: название «${k}» уже есть в этом предмете`);
        own.forEach((k) => seen.add(k));
      });
    });
  }
  return errors;
}

/** Условие «название совпадает на любом языке» для параметров $n, $n+1, $n+2 (kk, ru, en из файла). */
const anyTitle = (n: number) => "(" + [n, n + 1, n + 2].map((i) =>
  `lower(trim($${i})) in (lower(trim(title_kk)), lower(trim(title_ru)), lower(trim(title_en)))`).join(" or ") + ")";

/** Загружает программу. Вызывать внутри транзакции. */
export async function loadCurriculum(db: Db, c: Curriculum, { force = false } = {}): Promise<CurriculumReport> {
  const errors = validateCurriculum(c);
  if (errors.length) throw new Error("Ошибки в файле программы:\n" + errors.join("\n"));
  const report: CurriculumReport = {
    subjects: { created: [], existing: [] }, sections: { created: 0, updated: 0 }, topics: { created: 0, updated: 0 },
  };
  const g = c.grade;

  for (const s of c.subjects) {
    let [subj] = await db.query<{ id: string }>("select id from public.subjects where slug = $1", [s.id]);
    if (subj) report.subjects.existing.push(s.id);
    else {
      [subj] = await db.query<{ id: string }>(`
        insert into public.subjects (slug, icon, name_kk, name_ru, name_en, only_lang, sort_order)
        values ($1, $2, $3, $4, $5, $6, coalesce((select max(sort_order) + 1 from public.subjects), 0)) returning id`,
        [s.id, s.icon ?? s.name[1].trim()[0], ...s.name.map((x) => x.trim()), s.lang ?? null]);
      report.subjects.created.push(s.id);
    }

    let order = 0; // сквозной номер темы внутри предмета и класса
    const used: string[] = []; // темы базы, уже сопоставленные с темами файла
    for (const [si, sec] of s.sections.entries()) {
      const [found] = await db.query<{ id: string }>(
        `select id from public.sections where subject_id = $1 and grade = $2 and ${anyTitle(3)}
         order by sort_order limit 1`, [subj.id, g, ...sec.title]);
      let sectionId: string;
      if (found) {
        sectionId = found.id;
        await db.query(`update public.sections set sort_order = $2 ${force ? ", title_kk = $3, title_ru = $4, title_en = $5" : ""}
          where id = $1`, force ? [sectionId, si, ...sec.title.map((x) => x.trim())] : [sectionId, si]);
        report.sections.updated++;
      } else {
        [{ id: sectionId }] = await db.query<{ id: string }>(`
          insert into public.sections (subject_id, grade, title_kk, title_ru, title_en, sort_order)
          values ($1, $2, $3, $4, $5, $6) returning id`, [subj.id, g, ...sec.title.map((x) => x.trim()), si]);
        report.sections.created++;
      }

      for (const tp of sec.topics) {
        // Уже занятую тему не берём второй раз: в старых данных бывает неточный перевод, и одна старая тема
        // совпадает с двумя темами файла (ru «с натуральным показателем», kk «бүтін көрсеткішті» — 7 кл.).
        const [topic] = await db.query<{ id: string }>(
          `select id from public.topics where subject_id = $1 and grade = $2 and ${anyTitle(3)}
             and not (id = any($6::uuid[])) order by sort_order limit 1`, [subj.id, g, ...tp, used]);
        if (topic) used.push(topic.id);
        if (topic) {
          await db.query(`update public.topics set section_id = $2, sort_order = $3
            ${force ? ", title_kk = $4, title_ru = $5, title_en = $6" : ""} where id = $1`,
            force ? [topic.id, sectionId, order, ...tp.map((x) => x.trim())] : [topic.id, sectionId, order]);
          report.topics.updated++;
        } else {
          await db.query(`insert into public.topics (subject_id, grade, section_id, title_kk, title_ru, title_en, sort_order)
            values ($1, $2, $3, $4, $5, $6, $7)`, [subj.id, g, sectionId, ...tp.map((x) => x.trim()), order]);
          report.topics.created++;
        }
        order++;
      }
    }
    // Старые темы вне программы (без раздела) — после новых, чтобы номера не путались.
    await db.query(`update public.topics set sort_order = $3 + sort_order
      where subject_id = $1 and grade = $2 and section_id is null and sort_order < $3`, [subj.id, g, order]);
  }
  return report;
}
