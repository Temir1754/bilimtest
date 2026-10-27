import { useCallback, useEffect, useMemo, useState } from "react";
import { LogoMark } from "../components/NickMenu";
import { UI } from "../i18n/ui";
import { answer, mixedQuiz, percent, score, topicQuiz, type Quiz } from "../lib/quiz";
import { loadBest, loadPrefs, recordBest, savePrefs, type Best } from "../lib/storage";
import { tx } from "../lib/text";
import { LANGS, type Catalog, type DataSource, type Lang } from "../lib/types";
import { AccountMenu } from "./AccountMenu";
import { Home } from "./Home";
import { QuizView } from "./QuizView";
import { ResultView } from "./ResultView";
import { SubjectView } from "./SubjectView";

type View =
  | { name: "home" }
  | { name: "subject"; sid: string }
  | { name: "quiz"; sid: string; quiz: Quiz; index: number }
  | { name: "result"; sid: string; quiz: Quiz };

export function App({ source }: { source: DataSource }) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [best, setBest] = useState<Best>(loadBest);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>({ name: "home" });
  const { lang, grade } = prefs;
  const t = UI[lang];

  useEffect(() => {
    source.catalog().then(setCatalog, () => setFailed(true));
  }, [source]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const updatePrefs = (p: Partial<typeof prefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    savePrefs(next);
  };

  const sid = view.name === "home" ? null : view.sid;
  const subject = catalog?.subjects.find((s) => s.id === sid) ?? null;
  const topics = useMemo(
    () => (catalog && sid ? catalog.topics.filter((tp) => tp.subjectId === sid && tp.grade === grade)
      .sort((a, b) => a.sort - b.sort) : []),
    [catalog, sid, grade],
  );

  const go = (v: View, top = false) => {
    setView(v);
    if (top) window.scrollTo(0, 0);
  };

  async function start(subjectId: string, topicId: string | null) {
    const ids = topicId ? [topicId] : topics.map((tp) => tp.id);
    const qs = await source.questions(ids);
    const quiz = topicId ? topicQuiz(topicId, qs) : mixedQuiz(qs);
    if (quiz.items.length) go({ name: "quiz", sid: subjectId, quiz, index: 0 }, true);
  }

  const pick = useCallback((j: number) => {
    setView((v) => (v.name === "quiz" ? { ...v, quiz: answer(v.quiz, v.index, j) } : v));
  }, []);

  const next = useCallback(() => {
    if (view.name !== "quiz" || view.quiz.answers[view.index] === null) return;
    const { quiz, index, sid } = view;
    if (index < quiz.items.length - 1) {
      setView({ ...view, index: index + 1 });
      return;
    }
    if (quiz.topicId) setBest((b) => recordBest(b, quiz.topicId!, percent(score(quiz), quiz.items.length)));
    go({ name: "result", sid, quiz }, true);
  }, [view]);

  const topicTitle = (quiz: Quiz) => {
    const tp = topics.find((x) => x.id === quiz.topicId);
    return tp ? tx(tp.title, lang) : t.mixed;
  };

  let body;
  if (failed) body = <p className="error">{t.loadError}</p>;
  else if (!catalog) body = <p className="loading">{t.loading}</p>;
  else if (view.name === "home" || !subject) {
    body = <Home catalog={catalog} lang={lang} t={t} grade={grade}
      onGrade={(g) => updatePrefs({ grade: g })}
      onSubject={(id) => go({ name: "subject", sid: id }, true)} />;
  } else if (view.name === "subject") {
    body = <SubjectView subject={subject} topics={topics} grade={grade} lang={lang} t={t} best={best}
      onBack={() => go({ name: "home" })}
      onStart={(id) => start(subject.id, id)}
      onMixed={() => start(subject.id, null)} />;
  } else if (view.name === "quiz") {
    body = <QuizView quiz={view.quiz} index={view.index} lang={lang} t={t}
      heading={`${tx(subject.name, lang)} · ${topicTitle(view.quiz)}`}
      onBack={() => go({ name: "subject", sid: subject.id })}
      onPick={pick} onNext={next} />;
  } else {
    const i = topics.findIndex((tp) => tp.id === view.quiz.topicId);
    body = <ResultView quiz={view.quiz} title={topicTitle(view.quiz)} lang={lang} t={t}
      hasNext={i >= 0 && i < topics.length - 1}
      onBack={() => go({ name: "subject", sid: subject.id })}
      onRetry={() => start(subject.id, view.quiz.topicId)}
      onNextTopic={() => start(subject.id, topics[i + 1].id)} />;
  }

  return (
    <>
      <a className="skip" href="#main">{t.skip}</a>
      <header className="top"><div className="wrap">
        <button className="logo" type="button" onClick={() => go({ name: "home" })}>
          <LogoMark />
          Білімтест
        </button>
        <div className="top-right">
          <div className="langs" role="group" aria-label="Language">
            {LANGS.map((l: Lang) => (
              <button key={l} type="button" aria-pressed={l === lang} onClick={() => updatePrefs({ lang: l })}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          {/* «Кіру» → /login; после входа — ник с меню (план «Кіру», шаг 3) */}
          <AccountMenu ui={t} />
        </div>
      </div></header>
      <main id="main"><div className="wrap">{body}</div></main>
      <footer><div className="wrap">{t.free} · <a href="/privacy">{t.privacy}</a></div></footer>
    </>
  );
}
