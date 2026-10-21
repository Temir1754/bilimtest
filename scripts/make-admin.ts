// Назначает пользователя админом по email.
//   npm run make-admin -- you@example.com
import postgres from "postgres";
import { dbUrl } from "./env";

const email = process.argv.slice(2).find((a) => a.includes("@"));
if (!email) {
  console.error("Укажите email: npm run make-admin -- you@example.com");
  process.exit(1);
}

const sql = postgres(dbUrl(), { ssl: "require", prepare: false });
try {
  const rows = await sql`
    update public.profiles p set role = 'admin' from auth.users u
    where u.id = p.id and lower(u.email) = lower(${email})
    returning p.id`;
  if (rows.length) console.log(`${email} теперь админ ✓`);
  else {
    console.error(`Пользователь ${email} не найден. Сначала создайте его в Supabase: Authentication → Users → Add user.`);
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
