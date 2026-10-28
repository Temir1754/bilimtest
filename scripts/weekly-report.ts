// Отчёт владельцу за неделю (DECISIONS.md №112).
//   npm run weekly            — показать отчёт на экране (основной проект), письмо не отправляется
//   npm run weekly -- --send  — отправить письмо через Gmail (GMAIL_USER, GMAIL_APP_PASSWORD; кому — REPORT_TO или GMAIL_USER)
//   --test                    — тестовый проект
// В GitHub Actions (weekly.yml) ещё передаются CHECKS_FAILED, CHECKS_TOTAL и BACKUP_STATUS — раздел «Работа сайта».
import nodemailer from "nodemailer";
import postgres from "postgres";
import { dbUrl, need } from "./env";
import { collectWeekly, formatWeekly, type WeeklyHealth } from "./weekly";

const send = process.argv.includes("--send");
const now = new Date();
const health: WeeklyHealth | undefined = process.env.CHECKS_TOTAL
  ? { checksFailed: Number(process.env.CHECKS_FAILED) || 0, checksTotal: Number(process.env.CHECKS_TOTAL) || 0,
      backup: process.env.BACKUP_STATUS ?? "" }
  : undefined;

const sql = postgres(dbUrl(), { ssl: "require", prepare: false, onnotice: () => {} });
try {
  const data = await sql.begin("isolation level repeatable read read only", (tx) =>
    collectWeekly({ query: (q, p) => tx.unsafe(q, p as never[]) as never }, new Date(now.getTime() - 7 * 864e5)));
  const { subject, text } = formatWeekly(data, now, health);
  if (!send) {
    console.log(subject + "\n\n" + text);
  } else {
    const user = need("GMAIL_USER");
    const mail = nodemailer.createTransport({ service: "gmail", auth: { user, pass: need("GMAIL_APP_PASSWORD") } });
    await mail.sendMail({ from: `Білімтест <${user}>`, to: process.env.REPORT_TO?.trim() || user, subject, text });
    console.log("Письмо отправлено ✓");
  }
} catch (e) {
  console.error("Отчёт не отправлен:\n" + (e as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
