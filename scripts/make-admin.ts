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
  // Пользователь мог появиться раньше миграций — тогда профиля у него нет, создаём его здесь
  const rows = await sql`
    insert into public.profiles (id, full_name, role)
    select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', ''), 'admin' from auth.users u
    where lower(u.email) = lower(${email})
    on conflict (id) do update set role = 'admin'
    returning id`;
  if (rows.length) console.log(`${email} теперь админ ✓`);
  else {
    console.error(`Пользователь ${email} не найден. Сначала создайте его в Supabase: Authentication → Users → Add user.`);
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
