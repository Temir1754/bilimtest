import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./site/App";
import { localSource } from "./lib/localSource";
import "./styles/app.css";

// Админка — отдельный файл: загружается только по адресу /admin.
const Admin = lazy(() => import("./admin"));
const isAdmin = /^\/admin(\/|$)/.test(location.pathname);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isAdmin ? (
      <Suspense fallback={<p className="loading">Загрузка…</p>}><Admin /></Suspense>
    ) : (
      <App source={localSource} />
    )}
  </StrictMode>,
);
