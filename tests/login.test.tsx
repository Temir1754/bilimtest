import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadAccount, loginEmail, saveAccount, setRemember, type Account } from "../src/lib/account";
import type { AuthApi } from "../src/login/api";
import { LoginApp } from "../src/login/LoginApp";

// Заглушка входа: пароль «secret»; «temp» — временный пароль (нужно сменить).
// Ник ученика превращается в адрес входа, как в настоящем api.
function fakeApi(open = { teacher: false, student: false }) {
  const taken = new Set(["aidos07"]);
  const api: AuthApi = {
    signupOpen: async () => open,
    signUpStudent: vi.fn(async (s) => {
      if (taken.has(s.nickname)) throw new Error("nick_taken");
      taken.add(s.nickname);
    }),
    signIn: vi.fn(async (id: string, password: string) => {
      if (!["secret", "temp", "secret-123"].includes(password)) throw new Error("Invalid login credentials");
      const email = loginEmail(id);
      const account: Account = email.endsWith("@students.bilimtest.local")
        ? { name: id.trim().toLowerCase(), role: "student" }
        : { name: "aigerim_t", role: email.startsWith("admin") ? "admin" : "teacher" };
      return { account, mustChange: password === "temp" };
    }),
    changePassword: vi.fn(async () => {}),
  };
  return api;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("bt-prefs", JSON.stringify({ lang: "ru", grade: 5 }));
});
afterEach(cleanup);

async function logIn(user: ReturnType<typeof userEvent.setup>, id: string, password: string) {
  await user.type(screen.getByLabelText("Email или ник"), id);
  await user.type(screen.getByLabelText("Пароль"), password);
  await user.click(screen.getByRole("button", { name: "Войти" }));
}

describe("экран входа /login", () => {
  it("«Запомнить меня» по умолчанию не отмечено; неверный пароль — понятная ошибка", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    render(<LoginApp api={api} go={vi.fn()} />);
    expect((screen.getByRole("checkbox", { name: /Запомнить меня/ }) as HTMLInputElement).checked).toBe(false);
    await logIn(user, "aigerim@mail.kz", "wrong");
    expect(await screen.findByText("Неверный email, ник или пароль.")).toBeTruthy();
    expect(api.signIn).toHaveBeenCalledWith("aigerim@mail.kz", "wrong", false);
  });

  it("после входа — переход по роли: админ и учитель → /admin, ученик (по нику) → на главную", async () => {
    for (const [id, path] of [["admin@mail.kz", "/admin"], ["aigerim@mail.kz", "/admin"], ["Aidos07", "/"]]) {
      const user = userEvent.setup();
      const go = vi.fn();
      render(<LoginApp api={fakeApi()} go={go} />);
      await logIn(user, id, "secret");
      await vi.waitFor(() => expect(go).toHaveBeenCalledWith(path));
      cleanup();
    }
  });

  it("временный пароль: сначала новый пароль (не короче 8, совпадают), потом переход", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    const go = vi.fn();
    render(<LoginApp api={api} go={go} />);
    await logIn(user, "aigerim@mail.kz", "temp");
    expect(await screen.findByText("Придумайте новый пароль")).toBeTruthy();
    expect(go).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Новый пароль (не короче 8 знаков)"), "short");
    await user.type(screen.getByLabelText("Повторите пароль"), "short");
    await user.click(screen.getByRole("button", { name: "Сохранить и войти" }));
    expect(await screen.findByText("Пароль должен быть не короче 8 знаков.")).toBeTruthy();

    await user.clear(screen.getByLabelText("Новый пароль (не короче 8 знаков)"));
    await user.type(screen.getByLabelText("Новый пароль (не короче 8 знаков)"), "my-new-pass");
    await user.clear(screen.getByLabelText("Повторите пароль"));
    await user.type(screen.getByLabelText("Повторите пароль"), "my-new-pass");
    await user.click(screen.getByRole("button", { name: "Сохранить и войти" }));
    await vi.waitFor(() => expect(go).toHaveBeenCalledWith("/admin"));
    expect(api.changePassword).toHaveBeenCalledWith("my-new-pass");
  });

  it("глаз показывает пароль; «Забыли пароль?» — обратиться к администратору; вкладки «Регистрация» пока нет", async () => {
    const user = userEvent.setup();
    render(<LoginApp api={fakeApi()} go={vi.fn()} />);
    const pw = screen.getByLabelText("Пароль") as HTMLInputElement;
    expect(pw.type).toBe("password");
    await user.click(screen.getByRole("button", { name: "Показать пароль" }));
    expect(pw.type).toBe("text");
    expect(screen.queryByText("Регистрация")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Забыли пароль?" }));
    expect(screen.getByText(/обратитесь к администратору сайта/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "← Вернуться ко входу" }));
    expect(screen.getByLabelText("Email или ник")).toBeTruthy();
  });

  it("регистрация ученика (пилот): ник, пароль, класс, согласие; занятый ник — понятная ошибка; затем вход", async () => {
    const user = userEvent.setup();
    const api = fakeApi({ teacher: false, student: true });
    const go = vi.fn();
    render(<LoginApp api={api} go={go} />);
    await user.click(await screen.findByRole("tab", { name: "Регистрация" }));
    // учителям — подсказка про администратора
    await user.click(screen.getByRole("button", { name: /Учитель/ }));
    expect(screen.getByText(/аккаунт создаёт администратор сайта/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Ученик/ }));

    expect(screen.getByText(/Не пиши настоящее имя/)).toBeTruthy();
    await user.type(screen.getByLabelText("Ник"), "Aidos07");
    await user.type(screen.getByLabelText("Пароль (не короче 8 знаков)"), "secret-123");
    await user.type(screen.getByLabelText("Повтори пароль"), "secret-123");
    await user.click(screen.getByRole("button", { name: "Зарегистрироваться" }));
    expect(await screen.findByText("Выбери свой класс.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "7" }));
    await user.click(screen.getByRole("button", { name: "Зарегистрироваться" }));
    expect(await screen.findByText("Отметь согласие.")).toBeTruthy();
    await user.click(screen.getByRole("checkbox", { name: /политикой конфиденциальности/ }));
    await user.click(screen.getByRole("button", { name: "Зарегистрироваться" }));
    expect(await screen.findByText("Этот ник уже занят — придумай другой.")).toBeTruthy();

    await user.clear(screen.getByLabelText("Ник"));
    await user.type(screen.getByLabelText("Ник"), "sky_fox");
    await user.click(screen.getByRole("button", { name: "Зарегистрироваться" }));
    await vi.waitFor(() => expect(go).toHaveBeenCalledWith("/"));
    expect(api.signUpStudent).toHaveBeenLastCalledWith(
      { nickname: "sky_fox", password: "secret-123", grade: 7, consent: true, website: "" });
    expect(api.signIn).toHaveBeenCalledWith("sky_fox", "secret-123", false);
  });

  it("регистрация закрыта — вкладки «Регистрация» нет, по ссылке ?signup — «закрыта»", async () => {
    history.replaceState(null, "", "/login?signup");
    try {
      render(<LoginApp api={fakeApi()} go={vi.fn()} />);
      expect(await screen.findByText("Регистрация пока закрыта.")).toBeTruthy();
      expect(screen.queryByRole("tab")).toBeNull();
    } finally {
      history.replaceState(null, "", "/");
    }
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
