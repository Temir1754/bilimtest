import { level } from "../lib/quiz";
import type { Best } from "../lib/storage";
import { tx } from "../lib/text";
import type { Lang, Subject, Topic } from "../lib/types";
import type { UiText } from "../i18n/ui";

interface Props {
  subject: Subject;
  topics: Topic[];
  grade: number;
  lang: Lang;
  t: UiText;
  best: Best;
  onBack: () => void;
  onStart: (topicId: string) => void;
  onMixed: () => void;
}

export function BestBadge({ pct, t }: { pct: number | undefined; t: UiText }) {
  if (pct == null) return null;
  return <span className={`best ${["lo", "mid", "hi"][level(pct)]}`}>{t.best} {pct}%</span>;
}

export function SubjectView({ subject, topics, grade, lang, t, best, onBack, onStart, onMixed }: Props) {
  return (
    <>
      <button type="button" className="back" onClick={onBack}>{t.all}</button>
      <div className="sub-head">
        <div>
          <div className="kicker">{t.gl(grade)}</div>
          <h2>{tx(subject.name, lang)}</h2>
        </div>
        <button type="button" className="btn ghost" title={t.mixedHint} onClick={onMixed}>
          {t.mixed} · 10 {t.qs}
        </button>
      </div>
      {subject.onlyLang && subject.onlyLang !== lang && <div className="note">{t.onlyLang[subject.onlyLang]}</div>}
      <ol className="topics">
        {topics.map((tp, i) => (
          <li key={tp.id}>
            <span className="ix">{String(i + 1).padStart(2, "0")}</span>
            <span className="tt">
              <b>{tx(tp.title, lang)}</b>
              <span>{tp.questionCount} {t.qs}</span>
              <BestBadge pct={best[tp.id]} t={t} />
            </span>
            <button type="button" className="btn" onClick={() => onStart(tp.id)}>{t.start}</button>
          </li>
        ))}
      </ol>
    </>
  );
}
