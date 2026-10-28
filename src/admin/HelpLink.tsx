// Подсказки со ссылкой на «Нұсқаулық» (DECISIONS.md №115). Открываются в новой вкладке:
// учитель посреди загрузки файла или вопроса не теряет то, что уже сделал.
import { HELP, type HelpArticle } from "../i18n/help";
import { useT } from "./lang";

const href = (id: HelpArticle["id"]) => `/admin/help/${id}`;

/** Круглый «?» рядом с заголовком. */
export function HelpLink({ id }: { id: HelpArticle["id"] }) {
  const { lang, t } = useT();
  const title = HELP[lang](0).articles.find((a) => a.id === id)?.title ?? "";
  return (
    <a className="help-q" href={href(id)} target="_blank" rel="noopener" aria-label={`${t.hl.label}: ${title}`} title={title}>?</a>
  );
}

/** Подсказка текстом: «Как исправить ошибки — в инструкции». */
export function HelpMore({ id, text }: { id: HelpArticle["id"]; text: string }) {
  return <a className="help-more" href={href(id)} target="_blank" rel="noopener">{text} ↗</a>;
}
