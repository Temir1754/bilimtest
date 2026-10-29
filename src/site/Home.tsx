import { useState, type MouseEvent } from "react";
import { tx } from "../lib/text";
import { GRADES, topicCount, visibleTopics, type Catalog, type Lang } from "../lib/types";
import type { UiText } from "../i18n/ui";
import { HOME, type HomeText } from "../i18n/home";
import { CONTACT } from "../i18n/contact";

interface Props {
  catalog: Catalog;
  lang: Lang;
  t: UiText;
  grade: number;
  onGrade: (g: number) => void;
  onSubject: (sid: string) => void;
  /** Вошедший ученик (№111): сразу свой класс, остальные — по ссылке «Сыныпты ауыстыру». */
  ownGrade?: boolean;
}

// Плавная прокрутка к разделу главной без смены адреса (адрес следует за экраном, №101).
function scrollTo(e: MouseEvent, id: string) {
  e.preventDefault();
  const el = document.getElementById(id);
  if (!el) return;
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView?.({ behavior: still ? "auto" : "smooth", block: "start" });
  el.focus({ preventScroll: true });
}

export function Home({ catalog, lang, t, grade, onGrade, onSubject, ownGrade = false }: Props) {
  const [picking, setPicking] = useState(false);
  const h = HOME[lang];
  const shown = visibleTopics(catalog, lang);
  const totalQ = shown.reduce((n, tp) => n + topicCount(tp, lang), 0);
  const subjCount = new Set(shown.map((tp) => tp.subjectId)).size;
  const cards = catalog.subjects
    .map((s) => ({ s, tps: shown.filter((tp) => tp.subjectId === s.id && tp.grade === grade) }))
    .filter((c) => c.tps.length > 0);

  const picker = (
    <>
      {ownGrade && !picking ? (
        <p className="own-grade">
          <b>{t.gl(grade)}</b>{" "}
          <button type="button" className="link-btn" onClick={() => setPicking(true)}>{t.changeGrade}</button>
        </p>
      ) : (
        <>
          <div className="label">{t.grade}</div>
          <div className="grades" role="group" aria-label={t.grade}>
            {GRADES.map((g) => (
              <button key={g} type="button" aria-pressed={g === grade} onClick={() => { onGrade(g); setPicking(false); }}>
                <span className="n">{g}</span><span className="s">{t.gs}</span>
              </button>
            ))}
          </div>
        </>
      )}
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
              {tps.length} {t.topics} · {tps.reduce((n, tp) => n + topicCount(tp, lang), 0)} {t.qs}
            </span>
          </button>
        ))}
      </div>
    </>
  );

  // Вошедший ученик пришёл решать — без рекламы, сразу свой класс.
  if (ownGrade) {
    return (
      <>
        <section className="hero">
          <h1>{t.h1}</h1>
        </section>
        {picker}
      </>
    );
  }

  // Гость (№120): кто мы и с чего начать, сразу под первым экраном — выбор класса.
  return (
    <>
      <section className="hero2">
        <div className="hero-text">
          <p className="kicker">{h.kicker}</p>
          <h1>{h.h1a} <span className="h1-accent">{h.h1b}</span></h1>
          <p className="lede">{h.lede}</p>
          <div className="hero-acts">
            <a className="btn-lg" href="#catalog" onClick={(e) => scrollTo(e, "catalog")}>{h.toCatalog} <span aria-hidden="true">↓</span></a>
            <a className="btn-lg ghost" href="#teachers" onClick={(e) => scrollTo(e, "teachers")}>{h.teacher} <span aria-hidden="true">→</span></a>
          </div>
          <ul className="ticks">
            <li>{h.noSignup}</li>
            <li>{h.instant}</li>
          </ul>
        </div>
        <Demo h={h} />
      </section>

      <ul className="facts2">
        <li><b>4–11</b> {h.facts.grades}</li>
        {subjCount > 0 && <li><b>{subjCount}</b> {h.facts.subjects}</li>}
        {totalQ > 0 && <li><b>{totalQ}</b> {h.facts.qs}</li>}
      </ul>

      <section id="catalog" className="home-sec" tabIndex={-1} aria-labelledby="catalog-h">
        <h2 id="catalog-h" className="sec-h">{h.catalog}</h2>
        {picker}
      </section>

      <section className="home-sec" aria-labelledby="how-h">
        <h2 id="how-h" className="sec-h">{h.how.h}</h2>
        <ol className="how">
          {h.how.steps.map(([title, text], i) => (
            <li key={i}><span className="how-n" aria-hidden="true">{i + 1}</span><b>{title}</b><p>{text}</p></li>
          ))}
        </ol>
      </section>

      <section id="teachers" className="home-sec teachers" tabIndex={-1} aria-labelledby="teachers-h">
        <h2 id="teachers-h" className="sec-h">{h.teachers.h}</h2>
        <p className="lede">{h.teachers.lede}</p>
        {/* Схема «от файла до задания» (№122): шаги по порядку, на телефоне — столбиком */}
        <h3 className="flow-h">{h.teachers.flowH}</h3>
        <ol className="flow">
          {h.teachers.flow.map(([title, text], i) => (
            <li key={title}>
              <span className="flow-n" aria-hidden="true">{i + 1}</span>
              {i === 0 && <span className="flow-files" aria-hidden="true"><i>.docx</i><i>.xlsx</i></span>}
              <b>{title}</b><p>{text}</p>
            </li>
          ))}
        </ol>
        <p className="flow-cert">{h.teachers.cert}</p>
        <div className="teach-acts">
          <a className="btn-lg" href="/login">{h.teachers.login} <span aria-hidden="true">→</span></a>
          <p>{h.teachers.access}{" "}
            <a href={`mailto:${CONTACT}?subject=${encodeURIComponent(h.teachers.mail)}`}>{CONTACT}</a></p>
        </div>
      </section>

      <section className="home-sec" aria-labelledby="faq-h">
        <h2 id="faq-h" className="sec-h">{h.faq.h}</h2>
        <div className="faq">
          {h.faq.items.map(([q, a]) => (
            <details key={q}><summary>{q}</summary><p>{a}</p></details>
          ))}
        </div>
      </section>
    </>
  );
}

// Пример задания на первом экране: можно ответить, данные никуда не уходят.
const DEMO_OPTS = ["¼", "½", "1"];
const DEMO_RIGHT = 2;

function Demo({ h }: { h: HomeText }) {
  const [picked, setPicked] = useState<number | null>(null);
  const done = picked !== null;
  return (
    <div className="demo-wrap">
      <div className="demo" role="group" aria-label={h.demo.mark}>
        <div className="demo-top"><span className="demo-tag">{h.demo.tag}</span><span className="demo-mark">{h.demo.mark}</span></div>
        <p className="demo-expr" aria-label="3/4 + 1/4 = ?">
          <span className="frac" aria-hidden="true"><span>3</span><span>4</span></span>
          <span aria-hidden="true">+</span>
          <span className="frac" aria-hidden="true"><span>1</span><span>4</span></span>
          <span aria-hidden="true">= ?</span>
        </p>
        <p className="demo-q">{h.demo.q}</p>
        <div className="demo-opts">
          {DEMO_OPTS.map((o, i) => (
            <button key={o} type="button" disabled={done}
              className={done && i === DEMO_RIGHT ? "ok" : done && i === picked ? "no" : undefined}
              onClick={() => setPicked(i)}>{o}</button>
          ))}
        </div>
        <div aria-live="polite">
          {done && (
            <div className="demo-fb">
              <b className={picked === DEMO_RIGHT ? "good" : "bad"}>{picked === DEMO_RIGHT ? h.demo.right : h.demo.wrong}</b>
              <p>{h.demo.expl}</p>
              <button type="button" className="link-btn" onClick={() => setPicked(null)}>{h.demo.again}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
