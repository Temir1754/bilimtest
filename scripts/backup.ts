// Резервная копия данных базы: все таблицы схемы public в JSON и восстановление из него.
// Схема (таблицы, функции, правила) не копируется — она в supabase/migrations.
// Пользователи (auth.users) не копируются и при восстановлении не трогаются.
import type { Db } from "./importer";

export type Backup = Record<string, unknown[]>;

/** Таблицы public в порядке ссылок: сначала те, на которые ссылаются другие. */
export async function tablesInOrder(db: Db): Promise<string[]> {
  const tables = (await db.query<{ name: string }>(
    "select tablename as name from pg_tables where schemaname = 'public' order by tablename")).map((r) => r.name);
  const refs = await db.query<{ child: string; parent: string }>(`
    select c.relname as child, p.relname as parent from pg_constraint k
      join pg_class c on c.oid = k.conrelid join pg_class p on p.oid = k.confrelid
      join pg_namespace n on n.oid = c.relnamespace join pg_namespace pn on pn.oid = p.relnamespace
     where k.contype = 'f' and n.nspname = 'public' and pn.nspname = 'public' and c.oid <> p.oid`);
  const order: string[] = [];
  const visit = (t: string, path: string[] = []) => {
    if (order.includes(t) || path.includes(t)) return;
    for (const r of refs) if (r.child === t) visit(r.parent, [...path, t]);
    order.push(t);
  };
  tables.forEach((t) => visit(t));
  return order;
}

/** Все строки всех таблиц public. */
export async function dumpDb(db: Db): Promise<Backup> {
  const out: Backup = {};
  for (const t of await tablesInOrder(db)) {
    const [r] = await db.query<{ rows: unknown[] | string }>(
      `select coalesce(json_agg(t), '[]'::json) as rows from public."${t}" t`);
    out[t] = typeof r.rows === "string" ? JSON.parse(r.rows) : r.rows;
  }
  return out;
}

/** Заменяет данные всех таблиц public данными копии. Вызывать внутри транзакции.
 *  Таблицы, которых нет в копии (появились позже), остаются пустыми. */
export async function restoreDb(db: Db, backup: Backup): Promise<Record<string, number>> {
  const tables = await tablesInOrder(db);
  await db.query(`truncate table ${tables.map((t) => `public."${t}"`).join(", ")}`);
  const counts: Record<string, number> = {};
  for (const t of tables) {
    const rows = backup[t] ?? [];
    counts[t] = rows.length;
    if (!rows.length) continue;
    // Колонки, которых нет в копии (добавлены позже), получают значение null.
    const cols = (await db.query<{ name: string }>(`
      select attname as name from pg_attribute
       where attrelid = $1::regclass and attnum > 0 and not attisdropped and attgenerated = '' order by attnum`,
      [`public."${t}"`])).map((r) => `"${r.name}"`).join(", ");
    await db.query(`insert into public."${t}" (${cols})
      select ${cols} from json_populate_recordset(null::public."${t}", $1::json)`, [JSON.stringify(rows)]);
  }
  return counts;
}
