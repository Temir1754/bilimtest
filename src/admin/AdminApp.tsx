import { useCallback, useEffect, useState } from "react";
import { humanError, type AdminApi, type Me } from "./api";
import { Browser } from "./Browser";
import { ReviewQueue } from "./ReviewQueue";
import { QuestionEditor } from "./QuestionEditor";
import "./admin.css";

/** Что открыто: список вопросов, очередь проверки или конкретный вопрос. */
export type AdminView =
  | { name: "browse" | "review" }
  | { name: "edit"; id: string | null; topicId: string; back: "browse" | "review" };

export function AdminApp({ api }: { api: AdminApi }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined); // undefined — ещё проверяем
  const [error, setError] = useState("");
  const [view, setView] = useState<AdminView>({ name: "browse" });

  const refresh = useCallback(() => {
    api.me().then(setMe, (e) => { setError(humanError(e)); setMe(null); });
  }, [api]);

  useEffect(() => {
    refresh();
    return api.onAuthChange(refresh);
  }, [api, refresh]);

  useEffect(() => {
    document.title = "Білімтест · Админка";
    document.documentElement.lang = "ru";
    document.body.classList.add("adm-body"); // компактные размеры админки (admin.css)
    // Своя иконка вкладки: золотая с карандашом, чтобы не путать с сайтом ученика.
    document.querySelector<HTMLLinkElement>("link[rel=icon]")?.setAttribute("href", "/favicon-admin.svg");
  }, []);

  let body;
  if (me === undefined) body = <p className="loading">Загрузка…</p>;
  else if (me === null) body = <Login api={api} onDone={refresh} initialError={error} />;
  else if (me.role === "student") {
    body = (
      <div className="adm-box">
        <p>У аккаунта <b>{me.email}</b> нет доступа к админке. Попросите админа выдать роль учителя.</p>
        <button type="button" className="btn ghost" onClick={() => api.signOut().then(refresh)}>Выйти</button>
      </div>
    );
  } else if (view.name === "edit") {
    body = <QuestionEditor api={api} me={me} id={view.id} topicId={view.topicId}
      onClose={() => setView({ name: view.back })} />;
  } else if (view.name === "review") {
    body = <ReviewQueue api={api} onOpen={(id, topicId) => setView({ name: "edit", id, topicId, back: "review" })} />;
  } else {
    body = <Browser api={api} me={me}
      onOpen={(id, topicId) => setView({ name: "edit", id, topicId, back: "browse" })} />;
  }

  return (
    <>
      <a className="skip" href="#main">Перейти к содержимому</a>
      <header className="top"><div className="wrap">
        <a className="logo" href="/">
          <span className="logo-mark adm-mark">
            <svg width="18" height="18" viewBox="0 0 30 30" aria-hidden="true">
              <path d="M8.5 21.5l1-4.2 9.6-9.6a2.2 2.2 0 0 1 3.1 3.1l-9.6 9.6z" fill="none" stroke="#fff"
                strokeWidth="2.6" strokeLinejoin="round" />
              <path d="M17.2 9.6l3.2 3.2" stroke="#fff" strokeWidth="2.6" />
            </svg>
          </span>
          Білімтест <span className="adm-badge">админка</span>
        </a>
        {me && me.role !== "student" && (
          <nav className="adm-nav" aria-label="Разделы">
            <button type="button" aria-pressed={view.name !== "review"} onClick={() => setView({ name: "browse" })}>
              Вопросы
            </button>
            {me.role === "admin" && (
              <button type="button" aria-pressed={view.name === "review"} onClick={() => setView({ name: "review" })}>
                На проверке
              </button>
            )}
          </nav>
        )}
        {me && (
          <div className="adm-user">
            <span><span className="email">{me.email} · </span>
              {me.role === "admin" ? "админ" : me.role === "teacher" ? "учитель" : "ученик"}</span>
            <button type="button" className="btn ghost sm" onClick={() => api.signOut().then(refresh)}>Выйти</button>
          </div>
        )}
      </div></header>
      <main id="main"><div className="wrap">{body}</div></main>
    </>
  );
}

function Login({ api, onDone, initialError }: { api: AdminApi; onDone: () => void; initialError: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.signIn(email, password);
      onDone();
    } catch (err) {
      setError(humanError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="adm-box adm-login" onSubmit={submit}>
      <h2>Вход в админку</h2>
      <p className="lede">Для учителей и админов. Ученикам вход не нужен.</p>
      <label>Email<input type="email" autoComplete="username" required value={email}
        onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Пароль<input type="password" autoComplete="current-password" required value={password}
        onChange={(e) => setPassword(e.target.value)} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="btn" disabled={busy}>{busy ? "Вход…" : "Войти"}</button>
    </form>
  );
}
