// Проверка файлов программ data/curriculum/gradeN.json (формат и повторы названий).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateCurriculum, type Curriculum } from "../scripts/curriculum";

const dir = join(__dirname, "..", "data", "curriculum");
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];

describe.skipIf(!files.length)("программы классов (data/curriculum)", () => {
  it.each(files)("%s — без ошибок, класс совпадает с именем файла", (f) => {
    const c = JSON.parse(readFileSync(join(dir, f), "utf8")) as Curriculum;
    expect(validateCurriculum(c)).toEqual([]);
    expect(f).toBe(`grade${c.grade}.json`);
  });
});
