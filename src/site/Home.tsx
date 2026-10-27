import { tx } from "../lib/text";
import { GRADES, type Catalog, type Lang } from "../lib/types";
import type { UiText } from "../i18n/ui";

interface Props {
  catalog: Catalog;
  lang: Lang;
  t: UiText;
  grade: number;
  onGrade: (g: number) => void;
  onSubject: (sid: string) => void;
}

export function Home({ catalog, lang, t, grade, onGrade, onSubject }: Props) {
  const totalQ = catalog.topics.reduce((n, tp) => n + tp.questionCount, 0);
  const cards = catalog.subjects
    .map((s) => ({ s, tps: catalog.topics.filter((tp) => tp.subjectId === s.id && tp.grade === grade && tp.questionCount > 0) }))
    .filter((c) => c.tps.length > 0);

  return (
    <>
      <section className="hero">
        <h1>{t.h1}</h1>
        <p className="lede">{t.lede}</p>
        <div className="facts">
          <span><b>{catalog.subjects.length}</b> {t.subjCount}</span>
          <span><b>{totalQ}</b> {t.qs}</span>
          <span><b>3</b> {t.langCount}: қазақша · русский · English</span>
        </div>
      </section>
      <div className="label">{t.grade}</div>
      <div className="grades" role="group" aria-label={t.grade}>
        {GRADES.map((g) => (
          <button key={g} type="button" aria-pressed={g === grade} onClick={() => onGrade(g)}>
            <span className="n">{g}</span><span className="s">{t.gs}</span>
          </button>
        ))}
      </div>
      <div className="label" style={{ marginBottom: 10 }}>{t.subjects} · {t.gl(grade)}</div>
      <div className="subjects">
        {cards.map(({ s, tps }) => (
          <button key={s.id} type="button" className="subj" onClick={() => onSubject(s.id)}>
            <span className="ic" aria-hidden="true">{s.icon}</span>
            <span className="nm">
              {tx(s.name, lang)}
              {s.onlyLang && s.onlyLang !== lang && <span className="tag">{s.onlyLang.toUpperCase()}</span>}
            </span>
            <span className="mt">
              {tps.length} {t.topics} · {tps.reduce((n, tp) => n + tp.questionCount, 0)} {t.qs}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
