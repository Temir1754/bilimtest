// Адреса экранов админки (DECISIONS.md №87): у каждого шага свой адрес, поэтому работает кнопка «Назад» браузера
// и ссылку на тему или вопрос можно открыть в новой вкладке. Без React — легко тестировать.

export type AdminView =
  | { name: "grade" } //                                   /admin/questions — шаг 1: класс и предмет
  | { name: "topics"; slug: string; grade: number } //      /admin/questions/math/5 — шаг 2: темы
  | { name: "excel"; slug: string; grade: number } //       /admin/questions/math/5/excel — загрузка из Excel
  | { name: "topic"; topicId: string } //                   /admin/questions/topic/id — «Ашу»: вопросы темы
  | { name: "new"; topicId: string } //                     /admin/questions/topic/id/new — шаг 3: новый вопрос
  | { name: "edit"; id: string } //                         /admin/questions/q/id — вопрос
  | { name: "search" } //                                   /admin/questions/search — все вопросы с фильтрами
  | { name: "translate" } //                                /admin/questions/translate — «Аударма керек»
  | { name: "author"; id: string } //                       /admin/users/id/questions — вопросы учителя (№90)
  | { name: "my" | "review" | "schools" | "users" }; //     /admin/my, /admin/review, …

const Q = "/admin/questions";

export function toPath(v: AdminView): string {
  switch (v.name) {
    case "grade": return Q;
    case "topics": return `${Q}/${v.slug}/${v.grade}`;
    case "excel": return `${Q}/${v.slug}/${v.grade}/excel`;
    case "topic": return `${Q}/topic/${v.topicId}`;
    case "new": return `${Q}/topic/${v.topicId}/new`;
    case "edit": return `${Q}/q/${v.id}`;
    case "search": return `${Q}/search`;
    case "translate": return `${Q}/translate`;
    case "author": return `/admin/users/${v.id}/questions`;
    default: return `/admin/${v.name}`;
  }
}

/** Адрес → экран. Неизвестный адрес — шаг 1. */
export function parsePath(path: string): AdminView {
  const p = path.replace(/\/+$/, "").split("/").slice(2).map(decodeURIComponent); // без "" и "admin"
  if (p[0] === "users" && p[1] && p[2] === "questions") return { name: "author", id: p[1] };
  if (p[0] === "my" || p[0] === "review" || p[0] === "schools" || p[0] === "users") return { name: p[0] };
  if (p[0] !== "questions" || p.length === 1) return { name: "grade" };
  if (p[1] === "search" && p.length === 2) return { name: "search" };
  if (p[1] === "translate" && p.length === 2) return { name: "translate" };
  if (p[1] === "topic" && p[2]) return p[3] === "new" ? { name: "new", topicId: p[2] } : { name: "topic", topicId: p[2] };
  if (p[1] === "q" && p[2]) return { name: "edit", id: p[2] };
  const grade = Number(p[2]);
  if (p[1] && Number.isInteger(grade) && grade >= 4 && grade <= 11) {
    return p[3] === "excel" ? { name: "excel", slug: p[1], grade } : { name: "topics", slug: p[1], grade };
  }
  return { name: "grade" };
}

/** К какой вкладке шапки относится экран. */
export const navTab = (v: AdminView): "questions" | "my" | "review" | "schools" | "users" =>
  v.name === "author" ? "users"
    : v.name === "my" || v.name === "review" || v.name === "schools" || v.name === "users" ? v.name : "questions";
