// Недельный отчёт родителю (DECISIONS.md №106): текст из последних тестов ученика за 7 дней.
// Отправляет сам ученик — кнопкой WhatsApp или Telegram, без API и без оплаты.
import type { MeText } from "../i18n/me";
import type { MyRun } from "./api";

export interface Week {
  tests: number;
  questions: number;
  percent: number;
  best: { topic: string; percent: number } | null;
  weak: { topic: string; percent: number } | null;
}

/** Итоги за 7 дней. Тема «лучшая» и «слабая» — среди тем с 5 и больше ответами; смешанные тесты — только в общих числах. */
export function weekStats(runs: MyRun[], now = Date.now()): Week | null {
  const week = runs.filter((r) => now - new Date(r.finished_at).getTime() < 7 * 24 * 3600 * 1000);
  if (!week.length) return null;
  const score = week.reduce((n, r) => n + r.score, 0), total = week.reduce((n, r) => n + r.total, 0);
  const byTopic = new Map<string, { s: number; n: number }>();
  for (const r of week.filter((x) => x.topic)) {
    const v = byTopic.get(r.topic) ?? { s: 0, n: 0 };
    byTopic.set(r.topic, { s: v.s + r.score, n: v.n + r.total });
  }
  const topics = [...byTopic].filter(([, v]) => v.n >= 5).map(([topic, v]) => ({ topic, percent: Math.round((v.s / v.n) * 100) }))
    .sort((a, b) => b.percent - a.percent);
  const best = topics[0] ?? null, weak = topics.length > 1 ? topics[topics.length - 1] : null;
  return { tests: week.length, questions: total, percent: Math.round((score / total) * 100),
    best: best && best.percent >= 70 ? best : null, weak: weak && weak.percent < 70 ? weak : null };
}

export function reportText(nick: string, w: Week, t: MeText, site: string): string {
  const r = t.report;
  return [
    r.head(nick),
    `• ${r.summary(w.tests, w.questions, w.percent)}`,
    w.best && `• ${r.best}: ${w.best.topic} (${w.best.percent}%)`,
    w.weak && `• ${r.weak}: ${w.weak.topic} (${w.weak.percent}%)`,
    site,
  ].filter(Boolean).join("\n");
}
