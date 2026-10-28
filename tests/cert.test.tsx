// Страница сертификата /cert/id (№103): данные из базы, номер, проверка, кнопка печати.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CertPage from "../src/cert";

beforeEach(() => {
  localStorage.setItem("bt-prefs", JSON.stringify({ lang: "ru", grade: 6 }));
  history.replaceState(null, "", "/cert/0b5a3c1e-1111-4222-8333-444455556666");
});
afterEach(cleanup);

describe("сертификат автора", () => {
  it("показывает имя, школу, число вопросов, предметы и номер; печать — в PDF", async () => {
    const load = vi.fn(async () => ({ number: 7, full_name: "Бекмухамед Мирзабаев", school: "FGS", questions: 809, milestone: 500,
      subjects: [{ name_kk: "Қазақстан тарихы", name_ru: "История Казахстана", name_en: "History of Kazakhstan", grades: [6] }],
      issued_at: "2026-10-28T10:00:00Z" }));
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<CertPage load={load} />);
    expect(await screen.findByText("Бекмухамед Мирзабаев")).toBeTruthy();
    expect(load).toHaveBeenCalledWith("0b5a3c1e-1111-4222-8333-444455556666");
    expect(screen.getByText(/публикацию 809 тестовых вопросов/)).toBeTruthy();
    expect(screen.getByText("История Казахстана — 6 класс")).toBeTruthy();
    expect(screen.getByText(/Сертификат подлинный, BT-2026-00007/)).toBeTruthy();
    screen.getByRole("button", { name: "Печать / сохранить в PDF" }).click();
    expect(print).toHaveBeenCalled();
  });

  it("неизвестный сертификат — понятное сообщение", async () => {
    render(<CertPage load={async () => null} />);
    expect(await screen.findByText("Такой сертификат не найден.")).toBeTruthy();
  });
});
