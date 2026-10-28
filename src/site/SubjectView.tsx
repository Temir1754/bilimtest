import { level } from "../lib/quiz";
import type { Best } from "../lib/storage";
import { tx } from "../lib/text";
import { topicCount, type Lang, type Section, type Subject, type Topic } from "../lib/types";
import type { UiText } from "../i18n/ui";

interface Props {
  subject: Subject;
  topics: Topic[];
  sections?: Section[];
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

/** Темы группами по разделам в порядке программы (№48); темы без раздела — в конце, без заголовка. */
function groups(topics: Topic[], sections: Section[]) {
  const used = sections.filter((s) => topics.some((tp) => tp.sectionId === s.id)).sort((a, b) => a.sort - b.sort);
  const out: { section: Section | null; topics: Topic[] }[] = used.map((s) => ({ section: s, topics: topics.filter((tp) => tp.sectionId === s.id) }));
  const rest = topics.filter((tp) => !used.some((s) => s.id === tp.sectionId));
  if (rest.length) out.push({ section: null, topics: rest });
  return out;
}

export function SubjectView({ subject, topics, sections = [], grade, lang, t, best, onBack, onStart, onMixed }: Props) {
  let n = 0; // сквозной номер темы
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
      {groups(topics, sections).map((g) => (
        <section key={g.section?.id ?? "rest"} className="topic-group">
          {g.section && <h3 className="sec-title">{tx(g.section.title, lang)}</h3>}
          <ol className="topics">
            {g.topics.map((tp) => (
              <li key={tp.id}>
                <span className="ix">{String(++n).padStart(2, "0")}</span>
                <span className="tt">
                  <b>{tx(tp.title, lang)}</b>
                  <span>{topicCount(tp, lang)} {t.qs}</span>
                  <BestBadge pct={best[tp.id]} t={t} />
                </span>
                <button type="button" className="btn" onClick={() => onStart(tp.id)}>{t.start}</button>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </>
  );
}
