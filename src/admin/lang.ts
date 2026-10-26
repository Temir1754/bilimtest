// Язык админки: один на все экраны, через React-контекст (без передачи через каждый компонент).
import { createContext, useContext } from "react";
import { ADMIN, type AdminText } from "../i18n/admin";
import { tx } from "../lib/text";
import type { Lang } from "../lib/types";

export const AdminLang = createContext<{ lang: Lang; t: AdminText }>({ lang: "ru", t: ADMIN.ru });
export const useT = () => useContext(AdminLang);

/** Текст из колонок name_kk / name_ru / name_en (и т. п.) на языке админки, иначе на первом доступном. */
export function nm(row: object, prefix: string, lang: Lang): string {
  const r = row as Record<string, string | null>;
  return tx({ kk: r[`${prefix}_kk`] ?? "", ru: r[`${prefix}_ru`] ?? "", en: r[`${prefix}_en`] ?? "" }, lang);
}
