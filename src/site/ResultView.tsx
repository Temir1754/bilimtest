import { Rich } from "../components/Rich";
import { correctIndex, isCorrect, level, percent, score, type Quiz } from "../lib/quiz";
import { tx } from "../lib/text";
import type { Lang } from "../lib/types";
import type { UiText } from "../i18n/ui";

interface Props {
  quiz: Quiz;
  title: string;
  hasNext: boolean;
  lang: Lang;
  t: UiText;
  onBack: () => void;
  onRetry: () => void;
  onNextTopic: () => void;
}

const COLORS = ["var(--bad)", "var(--gold)", "var(--good)"];

export function ResultView({ quiz, title, hasNext, lang, t, onBack, onRetry, onNextTopic }: Props) {
  const sc = score(quiz);
  const pct = percent(sc, quiz.items.length);
  const lvl = level(pct);
  return (
    <div className="quiz">
      <button type="button" className="back" onClick={onBack}>{t.toTopics}</button>
      <div className="score">
        <div className="label">{t.result} · {title}</div>
        <div className="big">{sc}<small> / {quiz.items.length}</small></div>
        <div style={{ fontSize: 19, fontWeight: 700, color: COLORS[lvl] }}>{pct}% · {t.msg[lvl]}</div>
      </div>
      <div className="actions">
        <button type="button" className="btn" onClick={onRetry} autoFocus>{t.retry}</button>
        {hasNext && <button type="button" className="btn ghost" onClick={onNextTopic}>{t.nextTopic}</button>}
        <button type="button" className="btn ghost" onClick={onBack}>{t.toTopics.replace("← ", "")}</button>
      </div>
      <ol className="review">
        {quiz.items.map((it, k) => {
          const ok = isCorrect(it, quiz.answers[k]);
          const right = <Rich text={tx(it.options[correctIndex(it)].text, lang)} />;
          const picked = quiz.answers[k];
          return (
            <li key={k} className={ok ? "ok" : "no"}>
              <b>{k + 1}. <Rich text={tx(it.question.text, lang)} /></b>
              {ok ? (
                <span className="right">✓ {right}</span>
              ) : (
                <>
                  <span className="yours">✗ {t.yours}: {picked !== null && <Rich text={tx(it.options[picked].text, lang)} />}</span>
                  <br />
                  <span className="right">✓ {t.correct}: {right}</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
