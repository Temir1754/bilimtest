// Функция на сервере для экрана «Пользователи» (DECISIONS.md №80–81) и сброса пароля ученику учителем (№119).
//   { action: "create_teacher", email, data: { nickname, first_name, last_name, school_id | school_other, subjects, grades } }
//     → только админ; аккаунт сразу подтверждён, анкета — setup_teacher; ответ { id, password } — временный пароль показывается один раз
//   { action: "reset_password", user_id } → новый временный пароль { password }; при входе его нужно сменить.
//     Админ — любому, кроме себя; учитель — только ученику своего класса (решает база: begin_student_reset)
import { callerClient, cors, json, serviceClient, tempPassword } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  // Кто вызывает — по его входу. is_admin учитывает блокировку.
  const caller = callerClient(req);
  const { data: me } = await caller.auth.getUser();
  if (!me?.user) return json({ error: "forbidden" }, 403);
  const { data: isAdmin } = await caller.rpc("is_admin");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_input" }, 400);
  }
  const admin = serviceClient();

  if (body.action === "reset_password") {
    const id = String(body.user_id ?? "");
    if (!id || id === me.user.id) return json({ error: "bad_input" }, 400); // свой пароль меняют сами
    if (isAdmin !== true) {
      // Учитель: база проверяет, что это его ученик, считает лимит и записывает сброс в журнал.
      const { data: verdict, error } = await caller.rpc("begin_student_reset", { p_student: id });
      if (error || verdict !== "ok") {
        return verdict === "rate_limited" ? json({ error: "rate_limited" }, 429) : json({ error: "forbidden" }, 403);
      }
    }
    const password = tempPassword();
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) return json({ error: error.message }, 400);
    const { error: e2 } = await admin.from("profiles").update({ must_change_password: true }).eq("id", id);
    if (e2) return json({ error: e2.message }, 400);
    return json({ password });
  }

  if (isAdmin !== true) return json({ error: "forbidden" }, 403);

  if (body.action === "create_teacher") {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.endsWith("@students.bilimtest.local")) {
      return json({ error: "bad_email" }, 400);
    }
    const password = tempPassword();
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) return json({ error: /already been registered|already exists/i.test(error.message) ? "email_taken" : error.message }, 400);
    const { error: e2 } = await admin.rpc("setup_teacher", { p_user: data.user.id, p_data: body.data ?? {} });
    if (e2) {
      await admin.auth.admin.deleteUser(data.user.id); // анкета не прошла — аккаунт не оставляем
      return json({ error: /duplicate key|profiles_nickname/i.test(e2.message) ? "nick_taken" : e2.message }, 400);
    }
    return json({ id: data.user.id, password });
  }

  return json({ error: "unknown_action" }, 400);
});
