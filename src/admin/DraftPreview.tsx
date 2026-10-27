import { useMemo, useState } from "react";
import { LANGS, type Lang } from "../lib/types";
import type { TopicRow } from "./api";
import { issues, suggestTopic, type ColumnMap, type Draft, type DraftSet, type Issue } from "./drafts";
import { nm, useT } from "./lang";

/** Таблица-предпросмотр вопросов из Word или Excel со своими столбцами (№91): тема из файла → тема программы,
 *  правка вопроса и вариантов прямо в таблице, ошибки по строкам. Наверх отдаёт строки, готовые к загрузке. */
export function DraftPreview({ set, topics, lang, fixedLang, onLang, busy, onUpload }: {
  set: DraftSet;
  topics: TopicRow[];
  lang: Lang;
  fixedLang: boolean; // языковой предмет: язык вопросов — язык предмета
  onLang: (l: Lang) => void;
  busy: boolean;
  onUpload: (drafts: Draft[], topicOf: Record<string, string>) => void;
}) {
  const { lang: ui, t } = useT();
  const m = t.imp;
  const [drafts, setDrafts] = useState(set.drafts);
  // Тема программы для каждой темы файла: сначала — подсказка по названию.
  const suggested = useMemo(() => Object.fromEntries(set.topics.map((x) => [x.key, x.title ? suggestTopic(x.title, topics) : null])),
    [set.topics, topics]);
  const [topicOf, setTopicOf] = useState<Record<string, string>>({});
  const chosen = (key: string) => topicOf[key] ?? suggested[key] ?? "";
  const [onlyErrors, setOnlyErrors] = useState(false);

  const edit = (id: string, f: (d: Draft) => Draft) => setDrafts((ds) => ds.map((d) => (d.id === id ? f(d) : d)));
  const all = (d: Draft): Issue[] => [...(chosen(d.topic) ? [] : [{ code: "noTopic" } as Issue]), ...issues(d)];
  const say = (x: Issue) => {
    const i = m.issue;
    switch (x.code) {
      case "tooMany": return i.tooMany(x.n);
      case "keyOut": return i.keyOut(x.letter);
      case "numbering": return i.numbering(x.found, x.expected);
      default: return i[x.code];
    }
  };
  const bad = drafts.filter((d) => all(d).length);
  const good = drafts.length - bad.length;
  const resolved = Object.fromEntries(set.topics.map((x) => [x.key, chosen(x.key)]));

  return (
    <div className="im-preview">
      <div className="adm-summary">
        <label className="im-lang">{m.lang}
          <select value={lang} disabled={fixedLang} onChange={(e) => onLang(e.target.value as Lang)}>
            {LANGS.map((l) => <option key={l} value={l}>{t.edit.langOnly[l]}</option>)}
          </select>
        </label>
        <span className="st published">{m.ready(good)}</span>
        {bad.length > 0 && <span className="st bad">{m.errors(bad.length)}</span>}
        <label className="adm-check"><input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />
          {m.onlyErrors}</label>
      </div>
      {set.noKey && <p className="note">{m.noKeyAll}</p>}

      {set.topics.map((ft) => {
        const rows = drafts.filter((d) => d.topic === ft.key && (!onlyErrors || all(d).length));
        if (onlyErrors && !rows.length) return null;
        const head = m.fileTopic(ft.label, ft.title);
        return (
          <section key={ft.key} className="im-topic">
            <div className="im-topic-head">
              <h3>{head}</h3>
              <label>{m.progTopic}
                <select value={chosen(ft.key)} aria-label={`${m.progTopic}: ${head}`}
                  onChange={(e) => setTopicOf({ ...topicOf, [ft.key]: e.target.value })}>
                  <option value="">{m.pickTopic}</option>
                  {topics.map((x) => <option key={x.id} value={x.id}>{nm(x, "title", ui)}</option>)}
                </select>
              </label>
              {!topicOf[ft.key] && suggested[ft.key] && <small className="muted">{m.suggested}</small>}
            </div>
            <div className="adm-table-wrap im-wrap">
              <table className="adm-table im-table">
                <thead><tr><th>{m.num}</th><th>{m.question}</th><th>{m.answers}</th><th>{m.check}</th></tr></thead>
                <tbody>
                  {rows.map((d) => {
                    const errs = all(d);
                    const n = `${ft.label ? `${ft.label} · ` : ""}${d.num ?? ""}`.trim();
                    return (
                      <tr key={d.id} className={errs.length ? "bad" : ""}>
                        <td>{d.num}</td>
                        <td>
                          <textarea rows={2} aria-label={m.questionLabel(n)} value={d.text}
                            onChange={(e) => edit(d.id, (x) => ({ ...x, text: e.target.value }))} />
                        </td>
                        <td>
                          <ol className="im-opts">
                            {d.options.map((o, k) => (
                              <li key={k} className={d.correct === k ? "on" : ""}>
                                <input type="radio" name={`c-${d.id}`} checked={d.correct === k} aria-label={m.correctLabel(n, k + 1)}
                                  onChange={() => edit(d.id, (x) => ({ ...x, correct: k, checked: true, keyLetter: undefined }))} />
                                <input value={o} aria-label={m.optionLabel(n, k + 1)}
                                  onChange={(e) => edit(d.id, (x) => ({ ...x, options: x.options.map((y, j) => (j === k ? e.target.value : y)) }))} />
                                <button type="button" className="link" aria-label={m.delOption(n, k + 1)} onClick={() => edit(d.id, (x) => ({
                                  ...x, options: x.options.filter((_, j) => j !== k),
                                  correct: x.correct === null || x.correct === k ? null : x.correct > k ? x.correct - 1 : x.correct,
                                }))}>×</button>
                              </li>
                            ))}
                          </ol>
                          {d.options.length < 4 && (
                            <button type="button" className="link small" onClick={() => edit(d.id, (x) => ({ ...x, options: [...x.options, ""] }))}>
                              {m.addOption}</button>
                          )}
                        </td>
                        <td>{errs.length ? `${m.errorPrefix} ${errs.map(say).join("; ")}` : m.ok}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <div className="actions">
        <button type="button" className="btn" disabled={busy || good === 0} onClick={() => onUpload(drafts, resolved)}>
          {busy ? m.uploading : m.upload(good)}
        </button>
      </div>
    </div>
  );
}

/** Окно «Какой столбец что значит?» для Excel, столбцы которого названы не как в шаблоне. */
export function ColumnMapper({ head, sample, start, onDone, onCancel }: {
  head: string[]; sample: unknown[]; start: ColumnMap; onDone: (m: ColumnMap) => void; onCancel: () => void;
}) {
  const { t } = useT();
  const c = t.imp.map;
  const [map, setMap] = useState(start);
  const [tried, setTried] = useState(false);
  const cols = head.map((h, i) => ({ i, name: c.col(i, String(h ?? "").trim()), ex: String(sample[i] ?? "").trim() }));
  const pick = (label: string, key: "topic" | "text" | "correct" | "explanation", optional: boolean) => (
    <label>{label}
      <select value={map[key] ?? -1} onChange={(e) => {
        const v = Number(e.target.value);
        setMap({ ...map, [key]: v < 0 && optional ? null : v, options: map.options.filter((x) => x !== v) });
      }}>
        <option value={-1}>{c.none}</option>
        {cols.map((x) => <option key={x.i} value={x.i}>{x.name}{x.ex ? ` (${x.ex.slice(0, 30)})` : ""}</option>)}
      </select>
    </label>
  );
  const ok = map.text >= 0 && map.correct >= 0;
  const taken = [map.topic, map.text, map.correct, map.explanation];
  return (
    <div className="adm-mini im-map" role="group" aria-label={c.title}>
      <h3>{c.title}</h3>
      <p className="muted">{c.lede}</p>
      <div className="adm-row grow">
        {pick(c.text, "text", false)}
        {pick(c.correct, "correct", false)}
      </div>
      <fieldset className="adm-chips">
        <legend>{c.options}</legend>
        {cols.filter((x) => !taken.includes(x.i)).map((x) => (
          <button key={x.i} type="button" aria-pressed={map.options.includes(x.i)}
            onClick={() => setMap({ ...map, options: map.options.includes(x.i) ? map.options.filter((y) => y !== x.i)
              : [...map.options, x.i].sort((a, b) => a - b) })}>{x.name}</button>
        ))}
      </fieldset>
      <div className="adm-row grow">
        {pick(c.topic, "topic", true)}
        {pick(c.explanation, "explanation", true)}
      </div>
      {tried && !ok && <p className="error" role="alert">{c.need}</p>}
      <div className="adm-row">
        <button type="button" className="btn sm" onClick={() => (ok ? onDone(map) : setTried(true))}>{c.next}</button>
        <button type="button" className="btn ghost sm" onClick={onCancel}>{t.cancel}</button>
      </div>
    </div>
  );
}
