// Точка входа экрана /login. Загружается отдельным файлом вместе с библиотекой входа и картинками барыса,
// поэтому главная страница не становится тяжелее.
import { AUTH } from "../i18n/auth";
import { loadPrefs } from "../lib/storage";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { supabaseAuthApi } from "./api";
import { LoginApp } from "./LoginApp";

const api = supabaseConfigured ? supabaseAuthApi(supabase()) : null;

export default function LoginRoot() {
  if (!api) {
    return <main className="wrap" style={{ paddingBlock: 40 }}><p className="error">{AUTH[loadPrefs().lang].err.noDb}</p></main>;
  }
  return <LoginApp api={api} />;
}
