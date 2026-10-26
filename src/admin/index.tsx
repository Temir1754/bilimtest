// Точка входа админки (/admin). Загружается отдельным файлом, ученик её не скачивает.
import { supabase, supabaseConfigured } from "../lib/supabase";
import { AdminApp } from "./AdminApp";
import { supabaseApi } from "./api";

const api = supabaseConfigured ? supabaseApi(supabase()) : null;

export default function AdminRoot() {
  if (!api) {
    return (
      <main className="wrap" style={{ paddingBlock: 40 }}>
        <p className="error">Админка не подключена к базе: в файле .env нет VITE_SUPABASE_URL или
          VITE_SUPABASE_PUBLISHABLE_KEY.</p>
      </main>
    );
  }
  return <AdminApp api={api} />;
}
