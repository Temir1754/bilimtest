// Кабинет ученика /me: переходы по роли, класс, ник, пароль, удаление (база — заглушка).
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeApi, MyClass, Profile } from "../src/me/api";
import { MeApp } from "../src/me/MeApp";

const PASSWORD = "kid-pass-123";

function fakeApi(profile: Profile | null) {
  let me = profile;
  const classes: MyClass[] = [];
  const api = {
    load: vi.fn(async () => me),
    setGrade: vi.fn(async (grade: number) => { me = { ...me!, grade }; }),
    changeNickname: vi.fn(async (nickname: string) => {
      if (nickname === "taken") throw new Error("nick_taken");
      me = { ...me!, nickname };
    }),
    checkPassword: vi.fn(async (_nick: string, password: string) => {
      if (password !== PASSWORD) throw new Error("wrong_password");
    }),
    changePassword: vi.fn(async () => {}),
    deleteAccount: vi.fn(async () => { me = null; }),
    signOut: vi.fn(async () => { me = null; }),
    classes: vi.fn(async () => classes.slice()),
    joinClass: vi.fn(async (code: string, name: string) => {
      if (code !== "ABC234") throw new Error("Код класса не найден");
      classes.push({ id: "c1", subject: "π Математика", grade: 7, letter: "Б", teacher: "Бекмухамед М.", display_name: name });
    }),
    leaveClass: vi.fn(async () => { classes.length = 0; }),
    runs: vi.fn(async () => [{ subject: "π Математика", topic: "Дроби", grade: 7, score: 9, total: 10, finished_at: new Date(Date.now() - 864e5).toISOString() },
      { subject: "π Математика", topic: "", grade: 7, score: 4, total: 10, finished_at: new Date(Date.now() - 2 * 864e5).toISOString() }]),
  } satisfies MeApi;
  return api;
}
const kid = (): Profile => ({ nickname: "aidos07", role: "student", grade: 7 });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("bt-prefs", JSON.stringify({ lang: "ru", grade: 5 }));
});
afterEach(cleanup);

describe("кабинет ученика /me", () => {
  it("не вошёл — на /login; учитель и админ — в /admin", async () => {
    const go = vi.fn();
    render(<MeApp api={fakeApi(null)} go={go} />);
    await waitFor(() => expect(go).toHaveBeenCalledWith("/login"));
    cleanup();
    const go2 = vi.fn();
    render(<MeApp api={fakeApi({ nickname: "t", role: "teacher", grade: null })} go={go2} />);
    await waitFor(() => expect(go2).toHaveBeenCalledWith("/admin"));
  });

  it("класс: нажал — сохранено, и на главной откроется этот класс", async () => {
    const user = userEvent.setup();
    const api = fakeApi(kid());
    render(<MeApp api={api} go={vi.fn()} />);
    expect(await screen.findByText("Привет, aidos07!")).toBeTruthy();
    expect(screen.getByRole("button", { name: "7" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "9" }));
    expect(api.setGrade).toHaveBeenCalledWith(9);
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getByRole("button", { name: "9" }).getAttribute("aria-pressed")).toBe("true");
    expect(JSON.parse(localStorage.getItem("bt-prefs")!).grade).toBe(9);
  });

  it("ник: проверка формата, занятый ник, успешная смена", async () => {
    const user = userEvent.setup();
    const api = fakeApi(kid());
    render(<MeApp api={api} go={vi.fn()} />);
    const input = await screen.findByLabelText("Новый ник");
    await user.clear(input);
    await user.type(input, "Иван");
    await user.click(screen.getByRole("button", { name: "Изменить" }));
    expect(screen.getByRole("alert").textContent).toMatch(/3–20 знаков/);
    expect(api.changeNickname).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, "taken");
    await user.click(screen.getByRole("button", { name: "Изменить" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/уже занят/);

    await user.clear(input);
    await user.type(input, "Barys_07");
    await user.click(screen.getByRole("button", { name: "Изменить" }));
    expect(api.changeNickname).toHaveBeenLastCalledWith("barys_07");
    expect(await screen.findByText("Привет, barys_07!")).toBeTruthy();
  });

  it("пароль: без верного текущего пароля не меняется", async () => {
    const user = userEvent.setup();
    const api = fakeApi(kid());
    render(<MeApp api={api} go={vi.fn()} />);
    await user.type(await screen.findByLabelText("Текущий пароль"), "wrong-pass");
    await user.type(screen.getByLabelText("Новый пароль (не меньше 8 знаков)"), "new-pass-456");
    await user.type(screen.getByLabelText("Повтори новый пароль"), "new-pass-45");
    await user.click(screen.getByRole("button", { name: "Сменить пароль" }));
    expect(screen.getByRole("alert").textContent).toBe("Пароли не совпадают.");

    await user.type(screen.getByLabelText("Повтори новый пароль"), "6");
    await user.click(screen.getByRole("button", { name: "Сменить пароль" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Текущий пароль неверный.");
    expect(api.changePassword).not.toHaveBeenCalled();

    const current = screen.getByLabelText("Текущий пароль");
    await user.clear(current);
    await user.type(current, PASSWORD);
    await user.click(screen.getByRole("button", { name: "Сменить пароль" }));
    await waitFor(() => expect(api.changePassword).toHaveBeenCalledWith("new-pass-456"));
    expect(api.checkPassword).toHaveBeenLastCalledWith("aidos07", PASSWORD);
  });

  it("удаление: только с паролем; после — на главную", async () => {
    const user = userEvent.setup();
    const api = fakeApi(kid());
    const go = vi.fn();
    render(<MeApp api={api} go={go} />);
    await user.click(await screen.findByRole("button", { name: "Удалить аккаунт…" }));
    await user.type(screen.getByLabelText("Пароль для подтверждения"), "wrong-pass");
    await user.click(screen.getByRole("button", { name: "Удалить навсегда" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Текущий пароль неверный.");
    expect(api.deleteAccount).not.toHaveBeenCalled();

    const pw = screen.getByLabelText("Пароль для подтверждения");
    await user.clear(pw);
    await user.type(pw, PASSWORD);
    await user.click(screen.getByRole("button", { name: "Удалить навсегда" }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("/"));
    expect(api.deleteAccount).toHaveBeenCalled();
  });

  it("в шапке — ник с меню «На сайт / Выйти»", async () => {
    const user = userEvent.setup();
    const api = fakeApi(kid());
    const go = vi.fn();
    render(<MeApp api={api} go={go} />);
    await user.click(await screen.findByRole("button", { name: "Меню аккаунта" }));
    expect(screen.getByRole("menuitem", { name: "На сайт" }).getAttribute("href")).toBe("/");
    await user.click(screen.getByRole("menuitem", { name: "Выйти" }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("/"));
    expect(api.signOut).toHaveBeenCalled();
  });
});

describe("кабинет: классы (№102)", () => {
  it("ссылка учителя /me?join=КОД: код подставлен; вход в класс; неверный код — понятная ошибка", async () => {
    history.replaceState(null, "", "/me?join=abc234");
    const user = userEvent.setup();
    const api = fakeApi(kid());
    render(<MeApp api={api} go={vi.fn()} />);
    const code = await screen.findByLabelText("Код класса") as HTMLInputElement;
    expect(code.value).toBe("ABC234");
    expect(location.search).toBe(""); // код убран из адреса
    await user.type(screen.getByLabelText(/Имя/), "Айдос К.");
    await user.click(screen.getByRole("button", { name: "Войти в класс" }));
    expect(api.joinClass).toHaveBeenCalledWith("ABC234", "Айдос К.");
    expect(await screen.findByText(/Бекмухамед М./)).toBeTruthy(); // класс в списке
    expect(localStorage.getItem("bt-join")).toBeNull();

    await user.type(code, "ZZZZZZ");
    await user.click(screen.getByRole("button", { name: "Войти в класс" }));
    expect(await screen.findByText("Такого кода нет. Уточни у учителя.")).toBeTruthy();
  });

  it("не вошёл по ссылке учителя — код ждёт входа, после входа ученик попадает в кабинет", async () => {
    history.replaceState(null, "", "/me?join=ABC234");
    const go = vi.fn();
    render(<MeApp api={fakeApi(null)} go={go} />);
    await waitFor(() => expect(go).toHaveBeenCalledWith("/login"));
    expect(localStorage.getItem("bt-join")).toBe("ABC234");
    const { afterLoginPath } = await import("../src/lib/account");
    expect(afterLoginPath("student")).toBe("/me");
  });
});

describe("кабинет: мои результаты (№104)", () => {
  it("последние тесты из аккаунта с процентом; смешанный тест подписан", async () => {
    history.replaceState(null, "", "/me");
    render(<MeApp api={fakeApi(kid())} go={vi.fn()} />);
    expect(await screen.findByText("9/10 · 90%")).toBeTruthy();
    expect(screen.getByText("4/10 · 40%").className).toBe("lvl-low");
    expect(screen.getByText(/смешанный тест/)).toBeTruthy();
  });
});

describe("отчёт родителю (№106)", () => {
  it("кнопки WhatsApp и Telegram с готовым текстом за неделю", async () => {
    history.replaceState(null, "", "/me");
    render(<MeApp api={fakeApi(kid())} go={vi.fn()} />);
    const wa = await screen.findByRole("link", { name: "Отправить в WhatsApp" });
    const text = decodeURIComponent(wa.getAttribute("href")!.split("text=")[1]);
    expect(text).toContain("Білімтест: aidos07 — отчёт за неделю");
    expect(text).toContain("тестов: 2, вопросов: 20, в среднем 65%");
    expect(text).toContain("Хорошо: Дроби (90%)");
    expect(screen.getByRole("link", { name: "Отправить в Telegram" }).getAttribute("href")).toMatch(/^https:\/\/t\.me\/share\/url/);
  });
});
