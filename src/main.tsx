import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./site/App";
import { localSource } from "./lib/localSource";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App source={localSource} />
  </StrictMode>,
);
