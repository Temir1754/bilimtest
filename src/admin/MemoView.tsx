// Памятка для учеников класса (DECISIONS.md №116): как зарегистрироваться и войти в класс по коду.
// Печать — одна страница или 6 листков для раздачи (вырезать); или текст в WhatsApp-группу класса.
import qrcode from "qrcode-generator";
import { useEffect, useState } from "react";
import { memoMessage, memoText, type MemoInput } from "../i18n/memo";
import { LANGS, type Lang } from "../lib/types";
import { humanError, type AdminApi, type ClassRow, type SubjectRow } from "./api";
import { Copy, joinLink } from "./ClassesView";
import { nm, useT } from "./lang";
import { Go, type Nav } from "./Steps";

/** QR-код как SVG (без вставки HTML): тёмные клетки — одним путём. */
export function Qr({ text, label }: { text: string; label: string }) {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  return (
    <svg className="memo-qr" viewBox={`0 0 ${n + 8} ${n + 8}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={n + 8} height={n + 8} fill="#fff" /><path d={d} fill="#000" />
    </svg>
  );
}

export function Memo({ lang, m, small }: { lang: Lang; m: MemoInput; small?: boolean }) {
  const x = memoText(lang, m);
  return (
    <article className={small ? "memo small" : "memo"} lang={lang}>
      <h2>{x.title}</h2>
      <div className="memo-top">
        <Qr text={m.link} label={m.link} />
        <div>
          <p className="memo-code-label">{x.codeLabel}</p>
          <p className="memo-code">{m.code}</p>
          {!small && <p className="muted">{x.scan}</p>}
        </div>
      </div>
      <ol>{x.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      <p className="memo-save">{x.save}</p>
      <p className="memo-line">{x.nick}: <span /></p>
      <p className="memo-line">{x.password}: <span /></p>
    </article>
  );
}

export function MemoView({ api, id, nav }: { api: AdminApi; id: string; nav: Nav }) {
  const { lang: ui, t } = useT();
  const c = t.cls;
  const [k, setK] = useState<ClassRow | null>(null);
  const [subject, setSubject] = useState<SubjectRow | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [lang, setLang] = useState<Lang>(ui);
  const [slips, setSlips] = useState(false);

  useEffect(() => {
    Promise.all([api.classes(), api.subjects()]).then(([list, subjects]) => {
      const x = list.find((r) => r.id === id);
      if (!x) throw new Error("not found");
      setK(x);
      setSubject(subjects.find((s) => s.id === x.subject_id) ?? null);
    }).catch(setError);
  }, [api, id]);

  if (!k) return <div className="st-page">{error !== null ? <p className="error" role="alert">{humanError(error, t)}</p> : <p className="loading">{t.loading}</p>}</div>;
  const m: MemoInput = { subject: subject ? nm(subject, "name", lang) : "", grade: k.grade, letter: k.letter, code: k.join_code, link: joinLink(k.join_code) };
  const message = memoMessage(lang, m);

  return (
    <div className="st-page memo-page">
      <div className="memo-controls">
        <Go to={{ name: "class", id }} nav={nav} className="st-back">← {c.name(k.grade, k.letter)}</Go>
        <h1>{c.memo}</h1>
        <p className="muted">{c.memoLede}</p>
        <div className="adm-row">
          <span className="langs" role="group" aria-label={c.memoLang}>
            {LANGS.map((l) => <button key={l} type="button" aria-pressed={l === lang} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}
          </span>
          <span className="us-tabs" role="group" aria-label={c.memoLayout}>
            <button type="button" aria-pressed={!slips} onClick={() => setSlips(false)}>{c.memoPage}</button>
            <button type="button" aria-pressed={slips} onClick={() => setSlips(true)}>{c.memoSlips}</button>
          </span>
        </div>
        <div className="adm-row">
          <button type="button" className="btn" onClick={() => window.print()}>{c.memoPrint}</button>
          <a className="btn ghost" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener">{c.memoWa}</a>
          <Copy text={message} label={c.memoCopy} />
        </div>
      </div>
      {slips
        ? <div className="memo-slips">{[0, 1, 2, 3, 4, 5].map((i) => <Memo key={i} lang={lang} m={m} small />)}</div>
        : <Memo lang={lang} m={m} />}
    </div>
  );
}
