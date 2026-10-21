/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// npm test — быстрые тесты без интернета; npm run test:db (режим cloud) — тесты на тестовом проекте Supabase.
export default defineConfig(({ mode }) => {
  const cloud = mode === "cloud";
  return {
    plugins: [react()],
    build: { target: "es2020" },
    test: {
      environment: cloud ? "node" : "jsdom",
      include: cloud ? ["tests/cloud/**/*.test.ts"] : ["tests/**/*.test.{ts,tsx}"],
      exclude: cloud ? [] : ["tests/cloud/**", "node_modules/**"],
      fileParallelism: !cloud,
    },
  };
});
