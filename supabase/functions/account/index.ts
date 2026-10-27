// Функция на сервере для кабинета ученика /me (план «Кіру», шаг 7). Вызывает сам ученик.
//   { action: "change_nickname", nickname } — новый ник; вместе с ним меняется адрес входа ник@students.bilimtest.local (№71),
//     поэтому нужен ключ сервера: сам ученик адрес входа не меняет (на такой адрес нельзя прислать письмо подтверждения).
import { callerClient, cors, json, NICK, serviceClient, studentEmail } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const { data: me } = await callerClient(req).auth.getUser();
  const user = me?.user;
  if (!user) return json({ error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_input" }, 400);
  }
  const admin = serviceClient();

  if (body.action === "change_nickname") {
    // Только ученик: учитель и админ входят по email, их ник — просто подпись (меняет админ).
    const { data: p } = await admin.from("profiles").select("role, nickname, blocked_at").eq("id", user.id).single();
    if (p?.role !== "student" || p.blocked_at || !(user.email ?? "").endsWith("@students.bilimtest.local")) {
      return json({ error: "forbidden" }, 403);
    }
    const nickname = String(body.nickname ?? "").trim().toLowerCase();
    if (!NICK.test(nickname)) return json({ error: "bad_nickname" }, 400);
    if (nickname === p.nickname) return json({ ok: true });

    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("nickname", nickname);
    if (count) return json({ error: "nick_taken" }, 400);
    const { error } = await admin.auth.admin.updateUserById(user.id, { email: studentEmail(nickname), email_confirm: true });
    if (error) return json({ error: /already been registered|already exists/i.test(error.message) ? "nick_taken" : error.message }, 400);
    const { error: e2 } = await admin.from("profiles").update({ nickname }).eq("id", user.id);
    if (e2) {
      await admin.auth.admin.updateUserById(user.id, { email: user.email, email_confirm: true }); // ник не сохранился — вход прежний
      return json({ error: /duplicate key|profiles_nickname/i.test(e2.message) ? "nick_taken" : e2.message }, 400);
    }
    return json({ ok: true });
  }

  return json({ error: "unknown_action" }, 400);
});
