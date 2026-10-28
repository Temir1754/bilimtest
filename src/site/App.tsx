import { useCallback, useEffect, useMemo, useState } from "react";
import { LogoMark } from "../components/NickMenu";
import { UI } from "../i18n/ui";
import { answer, isCorrect, mistakesQuiz, mixedQuiz, percent, score, topicProgress, topicQuiz, type Quiz } from "../lib/quiz";
import { loadBest, loadHistory, loadPrefs, recordAnswer, recordBest, savePrefs, type Best } from "../lib/storage";
import { tx } from "../lib/text";
import { LANGS, visibleTopics, type Catalog, type DataSource, type Lang } from "../lib/types";
import { AccountMenu } from "./AccountMenu";
import { Home } from "./Home";
import { QuizView } from "./QuizView";
import { ResultView } from "./ResultView";
import { SubjectView } from "./SubjectView";

type View =
  | { name: "home" }
  | { name: "subject"; sid: string }
  | { name: "quiz"; sid: string; quiz: Quiz; index: number; mistakes?: boolean }
  | { name: "result"; sid: string; quiz: Quiz; mistakes?: boolean };

export function App({ source }: { source: DataSource }) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [best, setBest] = useState<Best>(loadBest);
  const [history, setHistory] = useState(loadHistory);
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
    () => (catalog && sid ? visibleTopics(catalog, lang).filter((tp) => tp.subjectId === sid && tp.grade === grade)
      .sort((a, b) => a.sort - b.sort) : []),
    [catalog, sid, grade, lang],
  );

  const go = (v: View, top = false) => {
    setView(v);
    if (top) window.scrollTo(0, 0);
  };

  async function start(subjectId: string, topicId: string | null) {
    const ids = topicId ? [topicId] : topics.map((tp) => tp.id);
    const qs = await source.questions(ids, lang);
    const quiz = topicId ? topicQuiz(topicId, qs, history) : mixedQuiz(qs);
    if (quiz.items.length) go({ name: "quiz", sid: subjectId, quiz, index: 0 }, true);
  }

  // «Қателермен жұмыс»: вопросы тем предмета, где последний ответ был неверным.
  const mistakeTopics = topics.filter((tp) => topicProgress(history, tp.id).wrong > 0);
  async function startMistakes(subjectId: string) {
    if (!mistakeTopics.length) return;
    const quiz = mistakesQuiz(await source.questions(mistakeTopics.map((tp) => tp.id), lang), history);
    if (quiz.items.length) go({ name: "quiz", sid: subjectId, quiz, index: 0, mistakes: true }, true);
  }

  // Ответ записывается в историю тренажёра: по ней выбираются следующие 10 вопросов темы.
  const pick = useCallback((j: number) => {
    if (view.name !== "quiz") return;
    const quiz = answer(view.quiz, view.index, j);
    if (quiz === view.quiz) return;
    const item = quiz.items[view.index];
    setView({ ...view, quiz });
    setHistory((h) => recordAnswer(h, item.question.id, item.question.topicId, isCorrect(item, j)));
  }, [view]);

  const next = useCallback(() => {
    if (view.name !== "quiz" || view.quiz.answers[view.index] === null) return;
    const { quiz, index, sid } = view;
    if (index < quiz.items.length - 1) {
      setView({ ...view, index: index + 1 });
      return;
    }
    if (quiz.topicId) setBest((b) => recordBest(b, quiz.topicId!, percent(score(quiz), quiz.items.length)));
    // Результат — в базу (статистика вопросов; у вошедшего — в аккаунт). Не получилось — тест всё равно засчитан в браузере.
    source.submit?.({ subjectId: sid, grade, topicId: quiz.topicId, answers: quiz.items.map((it, k) => ({
      question_id: it.question.id, option_id: it.options[quiz.answers[k] ?? -1]?.id ?? null })) }).catch(() => {});
    go({ name: "result", sid, quiz, mistakes: view.mistakes }, true);
  }, [view, source, grade]);

  const topicTitle = (quiz: Quiz, mistakes?: boolean) => {
    const tp = topics.find((x) => x.id === quiz.topicId);
    return tp ? tx(tp.title, lang) : mistakes ? t.mistakes : t.mixed;
  };

  let body;
  if (failed) body = <p className="error">{t.loadError}</p>;
  else if (!catalog) body = <p className="loading">{t.loading}</p>;
  else if (view.name === "home" || !subject) {
    body = <Home catalog={catalog} lang={lang} t={t} grade={grade}
      onGrade={(g) => updatePrefs({ grade: g })}
      onSubject={(id) => go({ name: "subject", sid: id }, true)} />;
  } else if (view.name === "subject") {
    body = <SubjectView subject={subject} topics={topics} sections={catalog.sections} grade={grade} lang={lang} t={t} best={best}
      onBack={() => go({ name: "home" })}
      onStart={(id) => start(subject.id, id)}
      history={history} mistakes={mistakeTopics.reduce((n, tp) => n + topicProgress(history, tp.id).wrong, 0)}
      onMistakes={() => startMistakes(subject.id)}
      onMixed={() => start(subject.id, null)} />;
  } else if (view.name === "quiz") {
    body = <QuizView quiz={view.quiz} index={view.index} lang={lang} t={t} onlyLang={subject.onlyLang}
      onReport={source.report ? (qid, msg, trap) => source.report!(qid, msg, lang, trap) : undefined}
      heading={`${tx(subject.name, lang)} · ${topicTitle(view.quiz, view.mistakes)}`}
      onBack={() => go({ name: "subject", sid: subject.id })}
      onPick={pick} onNext={next} />;
  } else {
    const i = topics.findIndex((tp) => tp.id === view.quiz.topicId);
    body = <ResultView quiz={view.quiz} title={topicTitle(view.quiz, view.mistakes)} lang={lang} t={t}
      hasNext={i >= 0 && i < topics.length - 1}
      onBack={() => go({ name: "subject", sid: subject.id })}
      onRetry={() => (view.mistakes ? startMistakes(subject.id) : start(subject.id, view.quiz.topicId))}
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
