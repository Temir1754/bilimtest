import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./site/App";
import { localSource } from "./lib/localSource";
import "./styles/app.css";

// Админка, экран входа и политика конфиденциальности — отдельные файлы: загружаются только по своим адресам.
const Admin = lazy(() => import("./admin"));
const Login = lazy(() => import("./login"));
const Privacy = lazy(() => import("./privacy"));
const path = location.pathname;
const Page = /^\/admin(\/|$)/.test(path) ? Admin : /^\/login(\/|$)/.test(path) ? Login
  : /^\/privacy(\/|$)/.test(path) ? Privacy : null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {Page ? (
      <Suspense fallback={<p className="loading">Загрузка…</p>}><Page /></Suspense>
    ) : (
      <App source={localSource} />
    )}
  </StrictMode>,
);
