import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./site/App";
import { dbSource } from "./lib/dbSource";
import type { DataSource } from "./lib/types";
import "./styles/app.css";

// Админка, экран входа, кабинет ученика и политика конфиденциальности — отдельные файлы: загружаются только по своим адресам.
const Admin = lazy(() => import("./admin"));
const Login = lazy(() => import("./login"));
const Privacy = lazy(() => import("./privacy"));
const Me = lazy(() => import("./me"));
const path = location.pathname;

// Вопросы — из базы (этап 4); без настроек Supabase (разработка без интернета) — из data/*.json.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
// data/*.json — отдельным файлом: в главный файл сайта они не попадают.
const local = () => import("./lib/localSource").then((m) => m.localSource);
const source: DataSource = url && key ? dbSource(url, key) : {
  catalog: () => local().then((s) => s.catalog()),
  questions: (ids, lang) => local().then((s) => s.questions(ids, lang)),
};
const Page = /^\/admin(\/|$)/.test(path) ? Admin : /^\/login(\/|$)/.test(path) ? Login
  : /^\/privacy(\/|$)/.test(path) ? Privacy : /^\/me(\/|$)/.test(path) ? Me : null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {Page ? (
      <Suspense fallback={<p className="loading">Загрузка…</p>}><Page /></Suspense>
    ) : (
      <App source={source} />
    )}
  </StrictMode>,
);
