// Шифрование копии базы (№105): без пароля не открыть, с паролем — те же файлы.
import { describe, expect, it } from "vitest";
import { seal, unseal } from "../scripts/seal";

describe("шифрование копии", () => {
  const files = { "questions.json": JSON.stringify([{ id: "q1", text_kk: "Сұрақ" }]), "school.classes.json": "[]" };
  it("с паролем — те же файлы; неверный пароль — ошибка; в файле нет открытого текста", () => {
    const box = seal(files, "очень-длинный-пароль");
    expect(unseal(box, "очень-длинный-пароль")).toEqual(files);
    expect(() => unseal(box, "другой-пароль-123")).toThrow(/Неверный пароль/);
    expect(box.toString("utf8")).not.toContain("Сұрақ");
    expect(() => seal(files, "короткий")).toThrow(/12 знаков/);
  });
});
