// Резервная копия данных базы: все таблицы схем public и school в JSON и восстановление из него.
// Схема (таблицы, функции, правила) не копируется — она в supabase/migrations.
// Пользователи (auth.users) не копируются и при восстановлении не трогаются.
// Имена в копии: таблицы public — без схемы (как в старых копиях), school — «school.имя».
import type { Db } from "./importer";

export type Backup = Record<string, unknown[]>;

const SCHEMAS = ["public", "school"];
const key = (schema: string, table: string) => (schema === "public" ? table : `${schema}.${table}`);
const sqlName = (k: string) => (k.includes(".") ? k.split(".").map((p) => `"${p}"`).join(".") : `public."${k}"`);

/** Таблицы в порядке ссылок: сначала те, на которые ссылаются другие. */
export async function tablesInOrder(db: Db): Promise<string[]> {
  const tables = (await db.query<{ s: string; t: string }>(
    "select schemaname as s, tablename as t from pg_tables where schemaname = any($1) order by schemaname, tablename",
    [SCHEMAS])).map((r) => key(r.s, r.t));
  const refs = (await db.query<{ cs: string; child: string; ps: string; parent: string }>(`
    select n.nspname as cs, c.relname as child, pn.nspname as ps, p.relname as parent from pg_constraint k
      join pg_class c on c.oid = k.conrelid join pg_class p on p.oid = k.confrelid
      join pg_namespace n on n.oid = c.relnamespace join pg_namespace pn on pn.oid = p.relnamespace
     where k.contype = 'f' and n.nspname = any($1) and pn.nspname = any($1) and c.oid <> p.oid`, [SCHEMAS]))
    .map((r) => ({ child: key(r.cs, r.child), parent: key(r.ps, r.parent) }));
  const order: string[] = [];
  const visit = (t: string, path: string[] = []) => {
    if (order.includes(t) || path.includes(t)) return;
    for (const r of refs) if (r.child === t) visit(r.parent, [...path, t]);
    order.push(t);
  };
  tables.forEach((t) => visit(t));
  return order;
}

/** Все строки всех таблиц. */
export async function dumpDb(db: Db): Promise<Backup> {
  const out: Backup = {};
  for (const t of await tablesInOrder(db)) {
    const [r] = await db.query<{ rows: unknown[] | string }>(
      `select coalesce(json_agg(t), '[]'::json) as rows from ${sqlName(t)} t`);
    out[t] = typeof r.rows === "string" ? JSON.parse(r.rows) : r.rows;
  }
  return out;
}

/** Заменяет данные всех таблиц данными копии. Вызывать внутри транзакции.
 *  Таблицы, которых нет в копии (появились позже), остаются пустыми. */
export async function restoreDb(db: Db, backup: Backup): Promise<Record<string, number>> {
  const tables = await tablesInOrder(db);
  await db.query(`truncate table ${tables.map(sqlName).join(", ")}`);
  const counts: Record<string, number> = {};
  for (const t of tables) {
    const rows = backup[t] ?? [];
    counts[t] = rows.length;
    if (!rows.length) continue;
    // Колонки, которых нет в копии (добавлены позже), получают значение null.
    const cols = (await db.query<{ name: string }>(`
      select attname as name from pg_attribute
       where attrelid = $1::regclass and attnum > 0 and not attisdropped and attgenerated = '' order by attnum`,
      [sqlName(t)])).map((r) => `"${r.name}"`).join(", ");
    // overriding system value — номера (identity, например номер сертификата) возвращаются как были.
    await db.query(`insert into ${sqlName(t)} (${cols}) overriding system value
      select ${cols} from json_populate_recordset(null::${sqlName(t)}, $1::text::json)`, [JSON.stringify(rows)]);
  }
  return counts;
}
