import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadAccount, loginEmail, saveAccount, setRemember } from "../src/lib/account";
import type { AuthApi } from "../src/login/api";
import { LoginApp } from "../src/login/LoginApp";

// Заглушка входа: пароль «secret»; ник ученика превращается в адрес входа, как в настоящем api.
function fakeApi() {
  const api: AuthApi = {
    signIn: vi.fn(async (id: string, password: string) => {
      if (password !== "secret") throw new Error("Invalid login credentials");
      const email = loginEmail(id);
      return email.endsWith("@students.bilimtest.local")
        ? { name: id.trim().toLowerCase(), role: "student" as const }
        : { name: "aigerim_t", role: email.startsWith("admin") ? "admin" as const : "teacher" as const };
    }),
    resetPassword: vi.fn(async () => {}),
  };
  return api;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("bt-prefs", JSON.stringify({ lang: "ru", grade: 5 }));
});
afterEach(cleanup);

describe("экран входа /login", () => {
  it("«Запомнить меня» по умолчанию не отмечено; неверный пароль — понятная ошибка", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    render(<LoginApp api={api} go={vi.fn()} />);
    expect((screen.getByRole("checkbox", { name: /Запомнить меня/ }) as HTMLInputElement).checked).toBe(false);
    await user.type(screen.getByLabelText("Email или ник"), "aigerim@mail.kz");
    await user.type(screen.getByLabelText("Пароль"), "wrong");
    await user.click(screen.getByRole("button", { name: "Войти" }));
    expect(await screen.findByText("Неверный email, ник или пароль.")).toBeTruthy();
    expect(api.signIn).toHaveBeenCalledWith("aigerim@mail.kz", "wrong", false);
  });

  it("после входа — переход по роли: админ и учитель → /admin, ученик (по нику) → на главную", async () => {
    for (const [id, path] of [["admin@mail.kz", "/admin"], ["aigerim@mail.kz", "/admin"], ["Aidos07", "/"]]) {
      const user = userEvent.setup();
      const go = vi.fn();
      render(<LoginApp api={fakeApi()} go={go} />);
      await user.type(screen.getByLabelText("Email или ник"), id);
      await user.type(screen.getByLabelText("Пароль"), "secret");
      await user.click(screen.getByRole("checkbox", { name: /Запомнить меня/ }));
      await user.click(screen.getByRole("button", { name: "Войти" }));
      await vi.waitFor(() => expect(go).toHaveBeenCalledWith(path));
      cleanup();
    }
  });

  it("глаз показывает пароль; «Забыли пароль?» отправляет письмо; вкладки «Регистрация» пока нет", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    render(<LoginApp api={api} go={vi.fn()} />);
    const pw = screen.getByLabelText("Пароль") as HTMLInputElement;
    expect(pw.type).toBe("password");
    await user.click(screen.getByRole("button", { name: "Показать пароль" }));
    expect(pw.type).toBe("text");
    expect(screen.queryByText("Регистрация")).toBeNull(); // регистрация закрыта до Resend (№76)

    await user.click(screen.getByRole("button", { name: "Забыли пароль?" }));
    await user.type(screen.getByLabelText("Email"), "aigerim@mail.kz");
    await user.click(screen.getByRole("button", { name: "Отправить ссылку" }));
    expect(await screen.findByText(/Письмо отправлено на aigerim@mail.kz/)).toBeTruthy();
    expect(api.resetPassword).toHaveBeenCalledWith("aigerim@mail.kz");
  });

  it("язык экрана переключается; девиз на трёх языках", async () => {
    const user = userEvent.setup();
    render(<LoginApp api={fakeApi()} go={vi.fn()} />);
    expect(screen.getByText("Знания — ключ к светлому будущему!")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "KK" }));
    expect(screen.getByText("Білім — жарқын болашақтың кілті!")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByText("Knowledge is the key to a bright future!")).toBeTruthy();
  });
});

describe("память входа (lib/account)", () => {
  it("ник ученика → технический адрес входа; email — как есть", () => {
    expect(loginEmail(" Aidos07 ")).toBe("aidos07@students.bilimtest.local");
    expect(loginEmail("Aigerim@Mail.kz")).toBe("aigerim@mail.kz");
  });

  it("без «Запомнить меня» — до закрытия браузера (sessionStorage), с ним — в localStorage", () => {
    setRemember(false);
    saveAccount({ name: "aidos07", role: "student" });
    expect(sessionStorage.getItem("bt-me")).toBeTruthy();
    expect(localStorage.getItem("bt-me")).toBeNull();
    setRemember(true);
    saveAccount({ name: "aidos07", role: "student" });
    expect(localStorage.getItem("bt-me")).toBeTruthy();
    expect(sessionStorage.getItem("bt-me")).toBeNull();
    expect(loadAccount()).toEqual({ name: "aidos07", role: "student" });
  });
});
