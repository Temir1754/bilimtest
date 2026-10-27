// Функция на сервере: упрощённая регистрация ученика в пилоте (DECISIONS.md №82–83). Вызывает кто угодно.
//   { nickname, password, grade, consent, website } — website — поле-ловушка, человек его не заполняет.
// Проверки: ловушка, лимит регистраций с одного IP в час, переключатель регистрации, ник, пароль, класс, согласие.
// Аккаунт создаётся уже подтверждённым (адрес ник@students.bilimtest.local писем не получает); дальше обычный вход.
import { cors, json, NICK, serviceClient, studentEmail } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return json({ error: "bad_input" }, 400);
  }
  if (String(b.website ?? "") !== "") return json({ ok: true }); // боту отвечаем «принято», ничего не создаём

  const admin = serviceClient();
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const { data: rateOk } = await admin.rpc("signup_rate_ok", { p_client: ip });
  if (rateOk !== true) return json({ error: "rate_limited" }, 429);
  const { data: open } = await admin.rpc("signup_open");
  if (open?.student !== true) return json({ error: "closed" }, 403);

  const nickname = String(b.nickname ?? "").trim().toLowerCase();
  const password = String(b.password ?? "");
  const grade = Number(b.grade);
  if (!NICK.test(nickname)) return json({ error: "bad_nickname" }, 400);
  if (password.length < 8 || password.length > 72) return json({ error: "weak_password" }, 400);
  if (!Number.isInteger(grade) || grade < 4 || grade > 11) return json({ error: "bad_grade" }, 400);
  if (b.consent !== true) return json({ error: "no_consent" }, 400);

  const { data, error } = await admin.auth.admin.createUser({ email: studentEmail(nickname), password, email_confirm: true });
  if (error) return json({ error: /already been registered|already exists/i.test(error.message) ? "nick_taken" : error.message }, 400);
  // Одна галочка в форме — согласие с политикой и «16 лет или родитель согласен» (№83).
  const { error: e2 } = await admin.rpc("register_student", { p_user: data.user.id,
    p_data: { nickname, grade, consent: true, parent_consent: true } });
  if (e2) {
    await admin.auth.admin.deleteUser(data.user.id);
    return json({ error: /duplicate key|profiles_nickname/i.test(e2.message) ? "nick_taken" : e2.message }, 400);
  }
  return json({ ok: true });
});
