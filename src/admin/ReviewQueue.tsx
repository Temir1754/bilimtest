import { useEffect, useState } from "react";
import { humanError, type AdminApi, type Me, type QuestionItem } from "./api";
import { fromRow, publishProblems, toPayload } from "./form";
import { nm, useT } from "./lang";
import { Go, type Nav } from "./Steps";

/** Экран админа «Тексеруде»: вопросы учителей на проверке — «Жариялау» или «Қайтару» с причиной (№87). */
export function ReviewQueue({ api, me, nav }: { api: AdminApi; me: Me; nav: Nav }) {
  const { t } = useT();
  const [items, setItems] = useState<QuestionItem[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    api.questions({ status: "review" }).then(setItems, setError);
  }, [api]);

  const done = (id: string, msg: string) => { setItems((list) => list?.filter((q) => q.id !== id) ?? null); setNotice(msg); };

  return (
    <div className="st-page">
      <h1>{t.review.title}</h1>
      <p className="muted">{t.review.lede}</p>
      {error !== null && <p className="error" role="alert">{humanError(error, t)}</p>}
      {notice && <p className="ok-msg" role="status">{notice}</p>}
      {items === null ? (error === null && <p className="loading">{t.loading}</p>)
        : items.length === 0 ? <p className="muted">{t.review.empty}</p>
        : (
          <ol className="st-qs">
            {items.map((q) => <ReviewItem key={q.id} api={api} me={me} q={q} nav={nav} onDone={(m) => done(q.id, m)} />)}
          </ol>
        )}
    </div>
  );
}

function ReviewItem({ api, q, nav, onDone }: { api: AdminApi; me: Me; q: QuestionItem; nav: Nav; onDone: (msg: string) => void }) {
  const { lang, t } = useT();
  const r = t.review;
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  // Перед публикацией — те же проверки, что у кнопки в форме; база проверяет ещё раз.
  async function publish() {
    setBusy(true);
    setProblems([]);
    try {
      const [row, subjects] = await Promise.all([api.question(q.id), api.subjects()]);
      const f = fromRow(row);
      const onlyLang = subjects.find((s) => s.id === q.topics.subject_id)?.only_lang ?? null;
      const list = publishProblems(f, onlyLang, t);
      if (list.length) { setProblems(list); return; }
      await api.saveQuestion(toPayload(f, "published"));
      onDone(r.published);
    } catch (e) {
      setProblems([humanError(e, t)]);
    } finally {
      setBusy(false);
    }
  }

  async function sendBack() {
    if (!reason.trim()) { setProblems([r.needReason]); return; }
    setBusy(true);
    setProblems([]);
    try {
      const f = fromRow(await api.question(q.id));
      await api.saveQuestion(toPayload({ ...f, reviewComment: reason.trim() }, "draft"));
      onDone(r.returnedMsg);
    } catch (e) {
      setProblems([humanError(e, t)]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="st-review">
      <Go to={{ name: "edit", id: q.id }} nav={nav} className="st-q">
        <span className="qt">{nm(q, "text", lang) || <i>{t.browse.noText}</i>}</span>
        <span className="meta"><span>{t.browse.gradeShort(q.topics.grade)} · {nm(q.topics, "title", lang)}</span></span>
      </Go>
      {returning && (
        <label className="st-field">{r.reason}
          <textarea rows={2} value={reason} autoFocus onChange={(e) => setReason(e.target.value)} />
        </label>
      )}
      {problems.length > 0 && <div className="error" role="alert"><ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>}
      <div className="st-actions">
        {!returning ? (
          <>
            <button type="button" className="btn" disabled={busy} onClick={publish}>{r.publish}</button>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => setReturning(true)}>{r.ret}</button>
          </>
        ) : (
          <>
            <button type="button" className="btn" disabled={busy} onClick={sendBack}>{r.send}</button>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => { setReturning(false); setProblems([]); }}>{t.cancel}</button>
          </>
        )}
      </div>
    </li>
  );
}
