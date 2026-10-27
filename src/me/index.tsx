// Точка входа кабинета ученика /me. Отдельный файл сборки: главная страница не становится тяжелее.
import { ME } from "../i18n/me";
import { loadPrefs } from "../lib/storage";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { supabaseMeApi } from "./api";
import { MeApp } from "./MeApp";

const api = supabaseConfigured ? supabaseMeApi(supabase()) : null;

export default function MeRoot() {
  if (!api) {
    return <main className="wrap" style={{ paddingBlock: 40 }}><p className="error">{ME[loadPrefs().lang].err.noDb}</p></main>;
  }
  return <MeApp api={api} />;
}
