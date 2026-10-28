import { useEffect, useRef, useState } from "react";
import { QuestionText, Rich } from "../components/Rich";
import { correctIndex, isCorrect, type Quiz } from "../lib/quiz";
import { tx } from "../lib/text";
import type { Lang } from "../lib/types";
import type { UiText } from "../i18n/ui";

interface Props {
  quiz: Quiz;
  index: number;
  heading: string; // «Предмет · Тема»
  lang: Lang;
  t: UiText;
  onBack: () => void;
  onPick: (option: number) => void;
  onNext: () => void;
  onlyLang?: Lang | null; // языковой предмет: вопросы на его языке — пометка рядом с заголовком
  onReport?: (questionId: string, message: string, trap: string) => Promise<{ ok: boolean; reason?: string }>;
}

/** «Қате бар ма?»: короткое сообщение об ошибке в вопросе. Скрытое поле-ловушка заполняют только боты. */
function ReportBox({ questionId, t, onReport }: { questionId: string; t: UiText;
  onReport: NonNullable<Props["onReport"]> }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [trap, setTrap] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "failed">("idle");
  if (state === "sent") return <p className="rep-done" role="status">{t.reportThanks}</p>;
  if (!open) return <button type="button" className="rep-open" onClick={() => setOpen(true)}>⚑ {t.reportOpen}</button>;
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    try {
      const r = await onReport(questionId, msg, trap);
      setState(r.ok ? "sent" : "failed");
    } catch { setState("failed"); }
  }
  return (
    <form className="rep" onSubmit={send}>
      <label>{t.reportLabel}
        <textarea rows={2} maxLength={1000} required minLength={3} value={msg} onChange={(e) => setMsg(e.target.value)} />
      </label>
      <input className="trap" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={trap}
        onChange={(e) => setTrap(e.target.value)} />
      {state === "failed" && <p className="error" role="alert">{t.reportFailed}</p>}
      <span className="rep-acts">
        <button type="submit" className="btn" disabled={state === "busy" || msg.trim().length < 3}>{t.reportSend}</button>
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>{t.reportCancel}</button>
      </span>
    </form>
  );
}

export function QuizView({ quiz, index, heading, lang, t, onBack, onPick, onNext, onlyLang, onReport }: Props) {
  const item = quiz.items[index];
  const n = quiz.items.length;
  const picked = quiz.answers[index];
  const done = picked !== null;
  const ok = isCorrect(item, picked);
  const firstOpt = useRef<HTMLButtonElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);

  // Фокус: на новом вопросе — первый вариант, после ответа — кнопка «Дальше».
  useEffect(() => {
    (done ? nextBtn : firstOpt).current?.focus();
  }, [index, done]);

  // Клавиатура: 1–4 — ответ, Enter — дальше.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      // Не мешаем печатать: в админке предпросмотр стоит рядом с полями ввода.
      if (e.target instanceof Element && e.target.closest("input, textarea, select")) return;
      if (/^[1-4]$/.test(e.key)) {
        const j = +e.key - 1;
        if (j < item.options.length) { e.preventDefault(); onPick(j); }
      } else if (e.key === "Enter" && done && document.activeElement !== nextBtn.current) {
        e.preventDefault();
        onNext();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [item, done, onPick, onNext]);

  return (
    <div className="quiz">
      <button type="button" className="back" onClick={onBack}>{t.toTopics}</button>
      <div className="qmeta"><span>{heading}{onlyLang && onlyLang !== lang && <span className="tag">{onlyLang.toUpperCase()}</span>}</span><span>{t.question} {index + 1} / {n}</span></div>
      <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={n} aria-valuenow={index + (done ? 1 : 0)}>
        <i style={{ width: `${((index + (done ? 1 : 0)) / n) * 100}%` }} />
      </div>
      <QuestionText text={tx(item.question.text, lang)} />
      {item.question.imageUrl && <img className="qimg" src={item.question.imageUrl} alt="" loading="lazy" />}
      <div className="opts">
        {item.options.map((o, j) => {
          const cls = done ? (o.correct ? "ok" : j === picked ? "no" : "") : "";
          return (
            <button key={j} ref={j === 0 ? firstOpt : undefined} type="button" className={`opt ${cls}`}
              disabled={done} onClick={() => onPick(j)}>
              <span className="k">{"ABCD"[j]}</span><span><Rich text={tx(o.text, lang)} /></span>
            </button>
          );
        })}
      </div>
      <div className={`fb ${done ? (ok ? "ok" : "no") : ""}`} aria-live="polite">
        {done && (ok ? t.right : <>{t.wrong} <Rich text={tx(item.options[correctIndex(item)].text, lang)} /></>)}
      </div>
      {done && tx(item.question.explanation, lang) && (
        <div className="expl"><b>{t.why}</b> <Rich text={tx(item.question.explanation, lang)} /></div>
      )}
      {done && onReport && <ReportBox key={item.question.id} questionId={item.question.id} t={t} onReport={onReport} />}
      <div className="qnav">
        <span className="label" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>{t.keys}</span>
        <button ref={nextBtn} type="button" className="btn" disabled={!done} onClick={onNext}>
          {index === n - 1 ? t.finish : t.next}
        </button>
      </div>
    </div>
  );
}
