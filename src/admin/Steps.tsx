// Экран «Сұрақтар» в 3 шага (DECISIONS.md №87): 1) класс и предмет, 2) тема, 3) вопрос (форма — QuestionEditor).
// Здесь же списки: вопросы темы («Ашу»), «Менің сұрақтарым», «Аударма керек».
// Один экран для админа и учителя; разница — в правах: учитель видит свои классы и предметы, меню «⋯» — только админ.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { GRADES, LANGS } from "../lib/types";
import {
  humanError, type AdminApi, type Me, type QuestionItem, type SectionRow, type SubjectRow, type TopicCount, type TopicRow,
} from "./api";
import { TitleForm } from "./Browser";
import { download, exportSheet } from "./excel";
import { nm, useT } from "./lang";
import { toPath, type AdminView } from "./route";
import { flatTopics, groupTopics, renumber, swap, type Group } from "./tree";

export type Nav = (v: AdminView, replace?: boolean) => void;

/** Ссылка на экран админки: настоящая ссылка (можно открыть в новой вкладке), переход — без перезагрузки страницы. */
export function Go({ to, nav, className, children, label }: {
  to: AdminView; nav: Nav; className?: string; children: ReactNode; label?: string;
}) {
  return (
    <a href={toPath(to)} className={className} aria-label={label} onClick={(e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      nav(to);
    }}>{children}</a>
  );
}

/** Индикатор «1. Сынып пен пән → 2. Тақырып → 3. Сұрақ»: текущий шаг голубой, пройденные — ссылки. */
export function StepBar({ step, nav, topics }: { step: 1 | 2 | 3; nav: Nav; topics?: AdminView }) {
  const { t } = useT();
  const targets: (AdminView | undefined)[] = [{ name: "grade" }, topics, undefined];
  return (
    <ol className="st-bar" aria-label={t.steps.label}>
      {t.steps.bar.map((label, i) => {
        const n = i + 1;
        const to = targets[i];
        const cls = n === step ? "on" : n < step ? "past" : "";
        return (
          <li key={label} className={cls} aria-current={n === step ? "step" : undefined}>
            {n < step && to ? <Go to={to} nav={nav}>{label}</Go> : <span>{label}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** Меню «⋯» (или кнопка с надписью, например «Excel ▾»): список действий во всплывающем окне. */
function More({ label, text, items }: {
  label: string;
  text?: string; // надпись на кнопке; без неё — «⋯»
  items: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  return (
    <div className="st-more" ref={ref}>
      <button type="button" className={text ? "btn ghost" : "st-more-btn"} aria-haspopup="menu" aria-expanded={open}
        aria-label={text ? undefined : label} onClick={() => setOpen(!open)}>{text ? `${text} ▾` : "⋯"}</button>
      {open && (
        <div className="acct-menu" role="menu">
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" className={it.danger ? "danger" : undefined}
              disabled={it.disabled} onClick={() => { setOpen(false); it.onClick(); }}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function Failure({ error, onClose }: { error: unknown; onClose?: () => void }) {
  const { t } = useT();
  if (error === null) return null;
  return (
    <p className="error" role="alert">{humanError(error, t)}{" "}
      {onClose && <button type="button" className="link" onClick={onClose}>×</button>}</p>
  );
}

// Класс шага 1 помнится до закрытия вкладки.
const GRADE_KEY = "bt-admin-grade";
const loadGrade = () => { try { return Number(sessionStorage.getItem(GRADE_KEY)) || 5; } catch { return 5; } };
const saveGrade = (g: number) => { try { sessionStorage.setItem(GRADE_KEY, String(g)); } catch { /* приватный режим */ } };

type Scope = { subjects: string[]; grades: number[] } | null;

/** Шаг 1: класс и предмет. Учитель видит классы и предметы из своей анкеты; один класс и один предмет — сразу шаг 2. */
export function GradeStep({ api, me, nav }: { api: AdminApi; me: Me; nav: Nav }) {
  const { lang, t } = useT();
  const s = t.steps;
  const [grade, setGrade] = useState(loadGrade);
  const [scope, setScope] = useState<Scope | undefined>(undefined); // undefined — ещё загружается
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [counts, setCounts] = useState<TopicCount[] | null>(null);
  const [min, setMin] = useState(5);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    Promise.all([api.subjects(), api.topicMin(), me.role === "teacher" ? api.teacherScope() : Promise.resolve(null)])
      .then(([list, m, sc]) => { setSubjects(list); setMin(m); setScope(sc); }, setError);
  }, [api, me.role]);

  const grades: number[] = scope ? GRADES.filter((g) => scope.grades.includes(g)) : [...GRADES];
  const g = grades.includes(grade) ? grade : grades[0] ?? grade;

  useEffect(() => {
    if (scope === undefined) return;
    if (scope && scope.grades.length === 1 && scope.subjects.length === 1) {
      const only = subjects.find((x) => x.id === scope.subjects[0]);
      if (only) nav({ name: "topics", slug: only.slug, grade: scope.grades[0] }, true);
    }
  }, [scope, subjects, nav]);

  useEffect(() => {
    let alive = true;
    setCounts(null);
    api.topicCounts(g, lang).then((c) => alive && setCounts(c), setError);
    return () => { alive = false; };
  }, [api, g, lang]);

  const inGrade = subjects.filter((x) => counts?.some((c) => c.subject_id === x.id) && (!scope || scope.subjects.includes(x.id)));

  return (
    <div className="st-page">
      <StepBar step={1} nav={nav} />
      <h1>{s.gradeTitle}</h1>
      <div className="st-grades" role="group" aria-label={s.gradeTitle}>
        {grades.map((x) => (
          <button key={x} type="button" aria-pressed={x === g} onClick={() => { setGrade(x); saveGrade(x); }}>{x}</button>
        ))}
      </div>
      <h2>{s.subjectTitle}</h2>
      <Failure error={error} />
      {counts === null ? <p className="loading">{t.loading}</p>
        : inGrade.length === 0 ? <p className="muted">{s.noSubjects}</p> : (
          <div className="st-subjects">
            {inGrade.map((x) => {
              const mine = counts.filter((c) => c.subject_id === x.id);
              const ready = mine.reduce((n, c) => n + c.ready, 0);
              const full = mine.filter((c) => c.ready >= min).length;
              return (
                <Go key={x.id} to={{ name: "topics", slug: x.slug, grade: g }} nav={nav} className="st-subject">
                  <span className="ic" aria-hidden="true">{x.icon}</span>
                  <span className="body">
                    <b>{nm(x, "name", lang)}</b>
                    <span className="st-fill" title={s.fill(full, mine.length)}>
                      <i style={{ width: `${mine.length ? Math.round((full / mine.length) * 100) : 0}%` }} />
                    </span>
                    <span className="muted">{s.count(ready)}</span>
                  </span>
                  <span className="go" aria-hidden="true">›</span>
                </Go>
              );
            })}
          </div>
        )}
      <p className="st-links">
        <Go to={{ name: "search" }} nav={nav}>{s.search}</Go>
        <Go to={{ name: "translate" }} nav={nav}>{s.translate}</Go>
      </p>
    </div>
  );
}

/** Бейдж темы: «2 / 5» (жёлтый) или «✓ 7 сұрақ» (зелёный). */
function Badge({ ready, min }: { ready: number; min: number }) {
  const { t } = useT();
  return ready >= min
    ? <span className="st-badge ok">{t.steps.done(ready)}</span>
    : <span className="st-badge low" title={t.steps.ofTitle(ready, min)}>{t.steps.of(ready, min)}</span>;
}

/** Шаг 2: темы предмета в классе, по разделам в порядке программы. */
export function TopicsStep({ api, me, slug, grade, nav }: { api: AdminApi; me: Me; slug: string; grade: number; nav: Nav }) {
  const { lang, t } = useT();
  const s = t.steps;
  const b = t.browse;
  const isAdmin = me.role === "admin";
  const [subject, setSubject] = useState<SubjectRow | null | undefined>(undefined);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [topics, setTopics] = useState<TopicRow[] | null>(null);
  const [ready, setReady] = useState<Record<string, number>>({});
  const [min, setMin] = useState(5);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<{ kind: "section" | "topic"; id: string } | null>(null);

  useEffect(() => {
    Promise.all([api.subjects(), api.topicMin()])
      .then(([list, m]) => { setSubject(list.find((x) => x.slug === slug) ?? null); setMin(m); }, setError);
  }, [api, slug]);

  const load = useCallback(async () => {
    if (!subject) return;
    try {
      const [secs, list, c] = await Promise.all([api.sections(subject.id, grade), api.topics(subject.id, grade),
        api.topicCounts(grade, lang)]);
      setSections(secs);
      setTopics(list);
      setReady(Object.fromEntries(c.map((x) => [x.topic_id, x.ready])));
    } catch (e) { setError(e); }
  }, [api, subject, grade, lang]);
  useEffect(() => { load(); }, [load]);

  if (subject === null) return <div className="st-page"><StepBar step={2} nav={nav} /><p className="muted">{b.noneFound}</p></div>;
  if (!subject || topics === null) {
    return <div className="st-page"><StepBar step={2} nav={nav} /><Failure error={error} />{error === null && <p className="loading">{t.loading}</p>}</div>;
  }

  const groups = groupTopics(sections, topics);
  const nextSort = topics.reduce((m, x) => Math.max(m, x.sort_order + 1), 0);

  // Порядок: разделы по номерам, темы — сквозными номерами в порядке групп (как в «Барлық сұрақтарды іздеу»).
  async function saveOrder(gs: Group[]) {
    try {
      const secs = gs.flatMap((g) => (g.section ? [g.section] : []));
      await Promise.all([...renumber(secs).map((x) => api.saveSection(x)), ...renumber(flatTopics(gs)).map((x) => api.saveTopic(x))]);
      await load();
    } catch (e) { setError(e); }
  }
  async function afterSave(saved: boolean) {
    setEditing(null);
    if (!saved) return;
    try {
      const [secs, list] = await Promise.all([api.sections(subject!.id, grade), api.topics(subject!.id, grade)]);
      await saveOrder(groupTopics(secs, list));
    } catch (e) { setError(e); }
  }
  async function removeTopic(x: TopicRow) {
    if (!confirm(b.confirmDelTopic(nm(x, "title", lang)))) return;
    try { await api.deleteTopic(x.id); await load(); } catch (e) { setError(e); }
  }
  async function removeSection(x: SectionRow) {
    if (!confirm(b.confirmDelSection(nm(x, "title", lang)))) return;
    try { await api.deleteSection(x.id); await afterSave(true); } catch (e) { setError(e); }
  }
  async function exportExcel() {
    setNotice("");
    try {
      const items = await api.exportQuestions(subject!.id, grade);
      if (!items.length) { setNotice(b.nothingToExport); return; }
      await download(`${t.xl.file(subject!.slug, grade)}.xlsx`, { [t.xl.sheet]: exportSheet(items, t) });
    } catch (e) { setError(e); }
  }

  return (
    <div className="st-page">
      <StepBar step={2} nav={nav} />
      <Go to={{ name: "grade" }} nav={nav} className="st-back">{s.back(grade, nm(subject, "name", lang))}</Go>
      <div className="st-head">
        <h1>{s.topicsTitle}</h1>
        <More label={s.excel} text={s.excel} items={[
          { label: b.importBtn, onClick: () => nav({ name: "excel", slug, grade }) },
          { label: b.exportBtn, onClick: exportExcel },
        ]} />
      </div>
      <p className="muted">{s.hint(min)}</p>
      <Failure error={error} onClose={() => setError(null)} />
      {notice && <p className="note" role="status">{notice}</p>}
      {topics.length === 0 && <p className="muted">{s.noTopics}</p>}

      {groups.map((g, gi) => (
        <section key={g.section?.id ?? "none"} className="st-section">
          <div className="st-sec-head">
            <h2>{g.section ? nm(g.section, "title", lang) : b.noSection}</h2>
            {isAdmin && g.section && (
              <More label={s.more(nm(g.section, "title", lang))} items={[
                { label: b.rename, onClick: () => setEditing({ kind: "section", id: g.section!.id }) },
                { label: `↑ ${b.sectionUp}`, disabled: gi === 0,
                  onClick: () => saveOrder([...swap(groups.filter((x) => x.section), gi, -1), ...groups.filter((x) => !x.section)]) },
                { label: `↓ ${b.sectionDown}`, disabled: !groups[gi + 1]?.section,
                  onClick: () => saveOrder([...swap(groups.filter((x) => x.section), gi, 1), ...groups.filter((x) => !x.section)]) },
                { label: t.del, danger: true, onClick: () => removeSection(g.section!) },
              ]} />
            )}
          </div>
          {editing?.kind === "section" && editing.id === g.section?.id && (
            <TitleForm api={api} kind="section" row={g.section} base={g.section!} onDone={afterSave} />
          )}
          <ol className="st-topics">
            {g.topics.map((x, i) => {
              const n = ready[x.id] ?? 0;
              return (
                <li key={x.id}>
                  <div className="st-topic">
                    <Go to={{ name: "topic", topicId: x.id }} nav={nav} className="name">{nm(x, "title", lang)}</Go>
                    <Badge ready={n} min={min} />
                    {n >= min
                      ? <Go to={{ name: "topic", topicId: x.id }} nav={nav} className="btn ghost st-act">{s.open}</Go>
                      : <Go to={{ name: "new", topicId: x.id }} nav={nav} className="btn st-act">{s.add}</Go>}
                    {isAdmin && (
                      <More label={s.more(nm(x, "title", lang))} items={[
                        { label: b.rename, onClick: () => setEditing({ kind: "topic", id: x.id }) },
                        { label: `↑ ${b.up}`, disabled: i === 0,
                          onClick: () => saveOrder(groups.map((y, k) => (k === gi ? { ...y, topics: swap(y.topics, i, -1) } : y))) },
                        { label: `↓ ${b.down}`, disabled: i === g.topics.length - 1,
                          onClick: () => saveOrder(groups.map((y, k) => (k === gi ? { ...y, topics: swap(y.topics, i, 1) } : y))) },
                        { label: t.del, danger: true, onClick: () => removeTopic(x) },
                      ]} />
                    )}
                  </div>
                  {editing?.kind === "topic" && editing.id === x.id && (
                    <TitleForm api={api} kind="topic" row={x} base={x} sections={sections} nextSort={nextSort} onDone={afterSave} />
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** Статус вопроса для списков: черновик с причиной возврата — «Қайтарылды». */
export function StatusChip({ q }: { q: Pick<QuestionItem, "status" | "review_comment"> }) {
  const { t } = useT();
  return q.status === "draft" && q.review_comment
    ? <span className="st returned">{t.steps.returned}</span>
    : <span className={`st ${q.status}`}>{t.status[q.status]}</span>;
}

/** Список вопросов: текст, статус, причина возврата, нет перевода; учителю чужой вопрос — только просмотр. */
export function QuestionCards({ items, me, nav, showTopic = false }: { items: QuestionItem[]; me: Me; nav: Nav; showTopic?: boolean }) {
  const { lang, t } = useT();
  return (
    <ol className="st-qs">
      {items.map((q) => {
        const foreign = me.role === "teacher" && (q.author_id !== me.id || q.status === "published");
        return (
          <li key={q.id}>
            <Go to={{ name: "edit", id: q.id }} nav={nav} className="st-q">
              <span className="qt">{nm(q, "text", lang) || <i>{t.browse.noText}</i>}</span>
              <span className="meta">
                <StatusChip q={q} />
                {showTopic && <span>{t.browse.gradeShort(q.topics.grade)} · {nm(q.topics, "title", lang)}</span>}
                {LANGS.filter((l) => !(q as unknown as Record<string, string | null>)[`text_${l}`]?.trim())
                  .map((l) => <span key={l} className="miss">{t.browse.missShort(l.toUpperCase())}</span>)}
                {foreign && <span className="muted">{t.steps.foreign}</span>}
              </span>
              {q.status === "draft" && q.review_comment && (
                <span className="st-reason"><b>{t.steps.reason}</b> {q.review_comment}</span>
              )}
            </Go>
          </li>
        );
      })}
    </ol>
  );
}

/** «Ашу»: вопросы темы. Учитель видит опубликованные вопросы всех и свои (так отдаёт база). */
export function TopicQuestions({ api, me, topicId, nav }: { api: AdminApi; me: Me; topicId: string; nav: Nav }) {
  const { lang, t } = useT();
  const s = t.steps;
  const [topic, setTopic] = useState<TopicRow | null>(null);
  const [subject, setSubject] = useState<SubjectRow | null>(null);
  const [items, setItems] = useState<QuestionItem[] | null>(null);
  const [ready, setReady] = useState(0);
  const [min, setMin] = useState(5);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const tp = await api.topic(topicId);
        const [list, qs, c, m] = await Promise.all([api.subjects(), api.questions({ topicId }), api.topicCounts(tp.grade, lang),
          api.topicMin()]);
        if (!alive) return;
        setTopic(tp);
        setSubject(list.find((x) => x.id === tp.subject_id) ?? null);
        setItems(qs);
        setReady(c.find((x) => x.topic_id === topicId)?.ready ?? 0);
        setMin(m);
      } catch (e) { if (alive) setError(e); }
    })();
    return () => { alive = false; };
  }, [api, topicId, lang]);

  const topicsView: AdminView | undefined = subject && topic ? { name: "topics", slug: subject.slug, grade: topic.grade } : undefined;
  return (
    <div className="st-page">
      <StepBar step={2} nav={nav} topics={topicsView} />
      {topicsView && <Go to={topicsView} nav={nav} className="st-back">{s.back(topic!.grade, nm(subject!, "name", lang))}</Go>}
      <Failure error={error} />
      {topic && items ? (
        <>
          <div className="st-head">
            <h1>{nm(topic, "title", lang)}</h1>
            <Go to={{ name: "new", topicId }} nav={nav} className="btn st-act">{s.add}</Go>
          </div>
          <p className="st-counter"><Badge ready={ready} min={min} /> {s.inTopic(ready, min)}</p>
          {items.length === 0 ? <p className="muted">{s.noQuestions}</p> : <QuestionCards items={items} me={me} nav={nav} />}
        </>
      ) : error === null && <p className="loading">{t.loading}</p>}
    </div>
  );
}

// Сначала то, что ждёт автора: возвращённые, затем черновики, на проверке, опубликованные.
const order = (q: QuestionItem) => (q.status === "draft" && q.review_comment ? 0 : q.status === "draft" ? 1 : q.status === "review" ? 2 : 3);

/** «Менің сұрақтарым»: все вопросы автора со статусами, сначала «Қайтарылды». */
export function MyQuestions({ api, me, nav }: { api: AdminApi; me: Me; nav: Nav }) {
  const { t } = useT();
  const [items, setItems] = useState<QuestionItem[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    api.questions({ authorId: me.id }).then((qs) => setItems(qs.slice().sort((a, b) => order(a) - order(b))), setError);
  }, [api, me.id]);
  return (
    <div className="st-page">
      <h1>{t.steps.myTitle}</h1>
      <Failure error={error} />
      {items === null ? error === null && <p className="loading">{t.loading}</p>
        : items.length === 0 ? <p className="muted">{t.steps.myEmpty}</p>
        : <QuestionCards items={items} me={me} nav={nav} showTopic />}
    </div>
  );
}

/** «Аударма керек» (№88): вопросы без RU или EN, кроме языковых предметов (у них один язык). */
export function TranslateList({ api, me, nav }: { api: AdminApi; me: Me; nav: Nav }) {
  const { t } = useT();
  const [items, setItems] = useState<QuestionItem[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    Promise.all([api.subjects(), api.questions({ needsTranslation: true })]).then(([subs, qs]) => {
      const single = new Set(subs.filter((x) => x.only_lang).map((x) => x.id));
      setItems(qs.filter((q) => !single.has(q.topics.subject_id)).sort((a, b) => order(a) - order(b)));
    }, setError);
  }, [api]);
  return (
    <div className="st-page">
      <StepBar step={1} nav={nav} />
      <Go to={{ name: "grade" }} nav={nav} className="st-back">← {t.steps.bar[0].replace(/^1\. /, "")}</Go>
      <h1>{t.steps.translate}</h1>
      <p className="muted">{t.steps.translateLede}</p>
      <Failure error={error} />
      {items === null ? error === null && <p className="loading">{t.loading}</p>
        : items.length === 0 ? <p className="muted">{t.steps.translateEmpty}</p>
        : <QuestionCards items={items} me={me} nav={nav} showTopic />}
      {items && items.length >= 300 && <p className="muted">{t.browse.first300}</p>}
    </div>
  );
}
