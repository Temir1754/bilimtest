import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import PrivacyPage from "../src/privacy";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("bt-prefs", JSON.stringify({ lang: "ru", grade: 5 }));
});
afterEach(cleanup);

describe("политика конфиденциальности /privacy", () => {
  it("черновик на трёх языках: какие данные, где хранятся, как удалить", async () => {
    const user = userEvent.setup();
    render(<PrivacyPage />);
    expect(screen.getByRole("heading", { name: "Политика конфиденциальности" })).toBeTruthy();
    expect(screen.getByText("Черновик — текст должен проверить юрист.")).toBeTruthy();
    expect(screen.getByText(/Ученик: только ник, пароль/)).toBeTruthy();
    expect(screen.getByText(/сервер в Германии/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Удаление аккаунта" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "KK" }));
    expect(screen.getByRole("heading", { name: "Құпиялылық саясаты" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByText("Draft — the text must be reviewed by a lawyer.")).toBeTruthy();
  });
});
