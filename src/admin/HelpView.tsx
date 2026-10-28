// «Нұсқаулық» — инструкция для учителя (DECISIONS.md №114). Тексты — src/i18n/help.ts, образцы Word — public/samples.
import { useEffect, useState } from "react";
import { HELP, type HelpArticle } from "../i18n/help";
import type { AdminApi } from "./api";
import { useT } from "./lang";
import { Go, type Nav } from "./Steps";

export function HelpView({ api, id, nav }: { api: AdminApi; id?: string; nav: Nav }) {
  const { lang } = useT();
  const [min, setMin] = useState(10);
  useEffect(() => { api.topicMin().then(setMin, () => {}); }, [api]);
  const h = HELP[lang](min);

  // Открыли статью по ссылке (/admin/help/class) — прокрутить к ней.
  useEffect(() => { if (id) document.getElementById(`help-${id}`)?.scrollIntoView?.(); }, [id]);

  return (
    <div className="st-page adm-help">
      <h1>{h.title}</h1>
      <p className="muted">{h.lede}</p>
      <nav aria-label={h.contents}>
        <ol className="adm-help-toc">
          {h.articles.map((a) => <li key={a.id}><Go to={{ name: "help", id: a.id }} nav={nav}>{a.title}</Go></li>)}
        </ol>
      </nav>
      {h.articles.map((a) => <Article key={a.id} a={a} lang={lang} top={h.top} />)}
    </div>
  );
}

function Article({ a, lang, top }: { a: HelpArticle; lang: string; top: string }) {
  return (
    <section id={`help-${a.id}`} aria-labelledby={`help-${a.id}-h`}>
      <h2 id={`help-${a.id}-h`}>{a.title}</h2>
      {a.body.map((b, i) => {
        if (typeof b !== "string") {
          return "steps" in b
            ? <ol key={i} className="adm-help-steps">{b.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            : <p key={i}><a className="btn ghost" href={`/samples/ulgi-${lang}.docx`} download>{b.sample}</a></p>;
        }
        // «Частые вопросы»: вопрос — до « — », ответ — после.
        const at = a.id === "faq" ? b.indexOf(" — ") : -1;
        return at > 0 ? <p key={i}><b>{b.slice(0, at)}</b>{b.slice(at)}</p> : <p key={i}>{b}</p>;
      })}
      <p className="hint"><a href="#main">{top}</a></p>
    </section>
  );
}
