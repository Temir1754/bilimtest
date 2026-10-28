import { useCallback, useEffect, useRef, useState } from "react";
import { GRADES, LANGS, type Lang } from "../lib/types";
import {
  humanError, type AdminApi, type Counts, type Me, type QuestionItem, type SectionRow, type SubjectRow, type TopicRow,
} from "./api";
import { checkSheet, download, exportSheet } from "./excel";
import { fromRow, publishProblems, type Status } from "./form";
import { nm, useT } from "./lang";
import { flatTopics, groupTopics, renumber, swap, type Group } from "./tree";

// Выбор класса, предмета, темы и фильтров переживает переход в форму вопроса и обратно.
const KEY = "bt-admin";
interface Sel {
  grade: number;
  subjectId: string | null;
  sectionId: string | null; // выбран раздел — вопросы всех его тем
  topicId: string | null;
  status: Status | "";
  missingLang: Lang | "";
  search: string;
  teacherCheck: boolean; // «требует проверки учителем» — по всем классам и предметам
}
function loadSel(): Sel {
  const d: Sel = { grade: 5, subjectId: null, sectionId: null, topicId: null, status: "", missingLang: "", search: "", teacherCheck: false };
  try {
    return { ...d, ...JSON.parse(sessionStorage.getItem(KEY) ?? "{}") };
  } catch {
    return d;
  }
}

const STATUSES: Status[] = ["draft", "review", "published"];

interface Props {
  api: AdminApi;
  me: Me;
  onOpen: (questionId: string | null, topicId: string) => void;
  onImport: (subjectId: string, grade: number) => void;
}

export function Browser({ api, me, onOpen, onImport }: Props) {
  const { lang, t } = useT();
  const b = t.browse;
  const [sel, setSel] = useState<Sel>(loadSel);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [inGrade, setInGrade] = useState<string[] | null>(null); // предметы класса; null — ещё не загружены
  const [allSubjects, setAllSubjects] = useState(false);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  const [questions, setQuestions] = useState<QuestionItem[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<"subject-new" | "subject" | "section-new" | "section" | "topic-new" | "topic" | null>(null);
  const [busy, setBusy] = useState<"export" | "publish" | null>(null);
  const [reload, setReload] = useState(0); // меняется — список вопросов загружается заново
  const mainRef = useRef<HTMLElement>(null);
  const isAdmin = me.role === "admin";
  const canPublish = isAdmin || me.trusted === true; // доверенный учитель публикует свои (№94)

  const update = (p: Partial<Sel>) => setSel((s) => {
    const next = { ...s, ...p };
    try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* приватный режим */ }
    return next;
  });

  // На узком экране список вопросов стоит под темами — после выбора темы или раздела прокручиваем к нему.
  const pick = (p: Pick<Sel, "sectionId" | "topicId">) => {
    update(p);
    setNotice("");
    setEditing(null);
    if (window.matchMedia?.("(max-width: 820px)").matches) {
      setTimeout(() => mainRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    }
  };

  const loadSubjects = useCallback(() => api.subjects().then(setSubjects, setError), [api]);
  useEffect(() => { loadSubjects(); }, [loadSubjects]);
  useEffect(() => {
    let alive = true;
    api.gradeSubjects(sel.grade).then((ids) => alive && setInGrade(ids), setError);
    return () => { alive = false; };
  }, [api, sel.grade, topics]);

  const loadTopics = useCallback(async () => {
    if (!sel.subjectId) { setSections([]); setTopics([]); setCounts({}); return; }
    try {
      const [secs, list] = await Promise.all([api.sections(sel.subjectId, sel.grade), api.topics(sel.subjectId, sel.grade)]);
      setSections(secs);
      setTopics(list);
      setCounts(await api.counts(list.map((x) => x.id)));
    } catch (e) { setError(e); }
  }, [api, sel.subjectId, sel.grade]);
  useEffect(() => { loadTopics(); }, [loadTopics]);

  // Вопросы: в выбранной теме или разделе, иначе в предмете и классе; без предмета — только по фильтрам.
  // «Требует проверки учителем» — по всем классам и предметам: таких вопросов немного, их отдают учителю списком.
  const hasFilter = Boolean(sel.status || sel.missingLang || sel.search.trim() || sel.teacherCheck);
  useEffect(() => {
    if (!sel.topicId && !sel.subjectId && !hasFilter) { setQuestions(null); return; }
    let alive = true;
    const where = sel.teacherCheck ? { teacherCheck: true }
      : { topicId: sel.topicId ?? undefined, sectionId: (!sel.topicId && sel.sectionId) || undefined,
          subjectId: sel.subjectId ?? undefined, grade: sel.grade };
    const timer = setTimeout(() => {
      api.questions({
        ...where, status: sel.status || undefined, missingLang: sel.missingLang || undefined, search: sel.search,
      }).then((q) => alive && setQuestions(q), setError);
    }, sel.search ? 300 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [api, sel, hasFilter, reload]);

  const subject = subjects.find((s) => s.id === sel.subjectId) ?? null;
  // В списке — только предметы класса (и выбранный, даже если в классе его нет); «Показать все» — чтобы добавить предмет в класс.
  const shown = allSubjects || !inGrade ? subjects : subjects.filter((s) => inGrade.includes(s.id) || s.id === sel.subjectId);
  const topic = topics.find((x) => x.id === sel.topicId) ?? null;
  const section = topic ? null : sections.find((x) => x.id === sel.sectionId) ?? null;
  const groups = groupTopics(sections, topics);
  const nextSort = topics.reduce((m, x) => Math.max(m, x.sort_order + 1), 0);

  // Порядок: разделы по номерам, темы — сквозными номерами в порядке групп. Сохраняем только изменившиеся.
  async function saveOrder(gs: Group[]) {
    try {
      const secs = gs.flatMap((g) => (g.section ? [g.section] : []));
      await Promise.all([...renumber(secs).map((x) => api.saveSection(x)),
        ...renumber(flatTopics(gs)).map((x) => api.saveTopic(x))]);
      await loadTopics();
    } catch (e) { setError(e); }
  }
  const moveTopic = (gi: number, i: number, dir: -1 | 1) =>
    saveOrder(groups.map((g, k) => (k === gi ? { ...g, topics: swap(g.topics, i, dir) } : g)));
  // Темы без раздела всегда в конце; двигаются только разделы.
  const moveSection = (i: number, dir: -1 | 1) =>
    saveOrder([...swap(groups.filter((g) => g.section), i, dir), ...groups.filter((g) => !g.section)]);

  // После сохранения темы или раздела номера снова идут подряд (тема с новым разделом встаёт в его конец).
  async function afterSave(saved = true) {
    setEditing(null);
    if (!saved || !sel.subjectId) return;
    try {
      const [secs, list] = await Promise.all([api.sections(sel.subjectId, sel.grade), api.topics(sel.subjectId, sel.grade)]);
      await saveOrder(groupTopics(secs, list));
    } catch (e) { setError(e); }
  }

  // Выгрузка: выбранная тема или все темы предмета в этом классе.
  async function exportExcel(s: SubjectRow) {
    setBusy("export");
    try {
      const items = await api.exportQuestions(s.id, sel.grade, sel.topicId ?? undefined);
      if (!items.length) { setNotice(b.nothingToExport); return; }
      await download(`${t.xl.file(s.slug, sel.grade)}${topic ? "-" + (topic.sort_order + 1) : ""}.xlsx`,
        { [t.xl.sheet]: exportSheet(items, t) });
    } catch (e) { setError(e); } finally { setBusy(null); }
  }

  // Выгрузка всех вопросов «требует проверки учителем» — список для учителя.
  async function exportChecks() {
    setBusy("export");
    try {
      const items = await api.exportChecks();
      if (!items.length) { setNotice(b.nothingToExport); return; }
      await download(`${b.checkFile}.xlsx`, {
        [t.xl.sheet]: checkSheet(items.map((x) => ({ ...x, subject: nm(x.subject, "name", lang) })), t),
      });
    } catch (e) { setError(e); } finally { setBusy(null); }
  }

  // «Опубликовать готовые черновики»: только вопросы без ошибок (те же проверки, что у кнопки «Опубликовать»).
  // Без темы — во всём предмете класса за одно нажатие.
  async function publishReady(s: SubjectRow, tp: TopicRow | null) {
    setBusy("publish");
    setNotice("");
    try {
      const pending = (await api.exportQuestions(s.id, sel.grade, tp?.id)).map((x) => x.q)
        .filter((q) => q.status !== "published" && (isAdmin || q.author_id === me.id));
      if (!pending.length) { setNotice(b.nothingToPublish); return; }
      const ready = pending.filter((q) => publishProblems(fromRow(q), s.only_lang, t).length === 0);
      const skipped = pending.length - ready.length;
      if (!ready.length) { setNotice(b.noneReady); return; }
      if (!confirm(b.confirmPublish(ready.length, skipped))) return;
      const n = await api.publish(ready.map((q) => q.id));
      setNotice(b.publishedN(n, pending.length - n));
      setReload((n) => n + 1);
      await loadTopics();
    } catch (e) { setError(e); } finally { setBusy(null); }
  }

  async function removeTopic(x: TopicRow) {
    if (!confirm(b.confirmDelTopic(nm(x, "title", lang)))) return;
    try {
      await api.deleteTopic(x.id);
      update({ topicId: null });
      await loadTopics();
    } catch (e) { setError(e); }
  }

  // Темы удалённого раздела остаются — в группе «Без раздела».
  async function removeSection(x: SectionRow) {
    if (!confirm(b.confirmDelSection(nm(x, "title", lang)))) return;
    try {
      await api.deleteSection(x.id);
      update({ sectionId: null });
      await afterSave();
    } catch (e) { setError(e); }
  }

  async function removeSubject(s: SubjectRow) {
    if (!confirm(b.confirmDelSubject(nm(s, "name", lang)))) return;
    try {
      await api.deleteSubject(s.id);
      update({ subjectId: null, sectionId: null, topicId: null });
      await loadSubjects();
    } catch (e) { setError(e); }
  }

  return (
    <div className="adm-cols">
      <aside className="adm-side">
        <div className="label">{b.grade}</div>
        <div className="adm-grades" role="group" aria-label={b.grade}>
          {GRADES.map((g) => (
            <button key={g} type="button" aria-pressed={g === sel.grade} onClick={() => update({ grade: g, sectionId: null, topicId: null })}>
              {g}
            </button>
          ))}
        </div>

        <div className="adm-head">
          <span className="label">{b.subject}</span>
          {isAdmin && <button type="button" className="link" onClick={() => setEditing("subject-new")}>{b.addSubject}</button>}
        </div>
        <select aria-label={b.subject} value={sel.subjectId ?? ""}
          onChange={(e) => update({ subjectId: e.target.value || null, sectionId: null, topicId: null })}>
          <option value="">{b.allSubjects}</option>
          {shown.map((s) => <option key={s.id} value={s.id}>{s.icon} {nm(s, "name", lang)}</option>)}
        </select>
        <button type="button" className="link small" onClick={() => setAllSubjects(!allSubjects)}>
          {allSubjects ? b.gradeSubjectsOnly(sel.grade) : b.showAllSubjects}
        </button>
        {isAdmin && subject && (
          <div className="adm-row">
            <button type="button" className="link" onClick={() => setEditing("subject")}>{b.editSubject}</button>
            <button type="button" className="link danger" onClick={() => removeSubject(subject)}>{t.del}</button>
          </div>
        )}
        {(editing === "subject-new" || (editing === "subject" && subject)) && (
          <SubjectForm api={api} subject={editing === "subject" ? subject : null} nextSort={subjects.length}
            onDone={(saved) => { setEditing(null); if (saved) loadSubjects(); }} />
        )}

        {subject && (
          <>
            <div className="adm-head">
              <span className="label">{b.topicsOf(sel.grade)}</span>
              <div className="adm-row">
                <button type="button" className="link" onClick={() => setEditing("section-new")}>{b.addSection}</button>
                <button type="button" className="link" onClick={() => setEditing("topic-new")}>{b.addTopic}</button>
              </div>
            </div>
            {editing === "section-new" && (
              <TitleForm api={api} kind="section" row={null}
                base={{ subject_id: subject.id, grade: sel.grade, sort_order: sections.length }} onDone={afterSave} />
            )}
            {editing === "topic-new" && (
              <TitleForm api={api} kind="topic" row={null} sections={sections} nextSort={nextSort}
                base={{ subject_id: subject.id, grade: sel.grade, sort_order: nextSort,
                  section_id: section?.id ?? topic?.section_id ?? null }}
                onDone={afterSave} />
            )}
            {topics.length === 0 && sections.length === 0 && <p className="muted">{b.noTopics}</p>}
            <ol className="adm-topics">
              <li>
                <button type="button" aria-pressed={!sel.topicId && !section} onClick={() => pick({ sectionId: null, topicId: null })}>
                  {b.allTopics}
                </button>
              </li>
              {groups.map((g, gi) => (
                <li key={g.section?.id ?? "none"} className="adm-sec">
                  {g.section ? (
                    <button type="button" className="sec" aria-pressed={g.section.id === section?.id}
                      onClick={() => pick({ sectionId: g.section!.id, topicId: null })}>
                      <span>{nm(g.section, "title", lang)}</span>
                      <small>{g.topics.reduce((n, x) => n + (counts[x.id]?.published ?? 0), 0)}</small>
                    </button>
                  ) : (
                    <div className="sec">{b.noSection}</div>
                  )}
                  {g.section && g.section.id === section?.id && (
                    <div className="adm-row">
                      <button type="button" className="link" onClick={() => setEditing("section")}>{b.rename}</button>
                      <button type="button" className="link" disabled={gi === 0} onClick={() => moveSection(gi, -1)}
                        aria-label={b.sectionUp}>↑</button>
                      <button type="button" className="link" disabled={!groups[gi + 1]?.section}
                        onClick={() => moveSection(gi, 1)} aria-label={b.sectionDown}>↓</button>
                      {isAdmin && (
                        <button type="button" className="link danger" onClick={() => removeSection(g.section!)}>{t.del}</button>
                      )}
                    </div>
                  )}
                  {g.section && g.section.id === section?.id && editing === "section" && (
                    <TitleForm api={api} kind="section" row={g.section} base={g.section} onDone={afterSave} />
                  )}
                  <ol>
                    {g.topics.map((x, i) => {
                      const c = counts[x.id];
                      return (
                        <li key={x.id}>
                          <button type="button" aria-pressed={x.id === sel.topicId} onClick={() => pick({ sectionId: null, topicId: x.id })}>
                            <span>{nm(x, "title", lang)}</span>
                            <small>
                              {c ? c.published : 0}
                              {c?.review ? <span className="st review" title={t.status.review}> +{c.review}</span> : null}
                              {c?.draft ? <span className="st draft" title={b.drafts}> +{c.draft}</span> : null}
                            </small>
                          </button>
                          {x.id === sel.topicId && (
                            <div className="adm-row">
                              <button type="button" className="link" onClick={() => setEditing("topic")}>{b.rename}</button>
                              <button type="button" className="link" disabled={i === 0} onClick={() => moveTopic(gi, i, -1)}
                                aria-label={b.up}>↑</button>
                              <button type="button" className="link" disabled={i === g.topics.length - 1}
                                onClick={() => moveTopic(gi, i, 1)} aria-label={b.down}>↓</button>
                              {isAdmin && <button type="button" className="link danger" onClick={() => removeTopic(x)}>{t.del}</button>}
                            </div>
                          )}
                          {x.id === sel.topicId && editing === "topic" && (
                            <TitleForm api={api} kind="topic" row={x} base={x} sections={sections} nextSort={nextSort}
                              onDone={afterSave} />
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </li>
              ))}
            </ol>
          </>
        )}
      </aside>

      <section className="adm-main" ref={mainRef}>
        <div className="adm-filters">
          <input type="search" placeholder={b.search} aria-label={b.searchLabel} value={sel.search}
            onChange={(e) => update({ search: e.target.value })} />
          <select aria-label={b.statusLabel} value={sel.status} onChange={(e) => update({ status: e.target.value as Status | "" })}>
            <option value="">{b.anyStatus}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t.status[s]}</option>)}
          </select>
          <select aria-label={b.langFilter} value={sel.missingLang}
            onChange={(e) => update({ missingLang: e.target.value as Lang | "" })}>
            <option value="">{b.allLangs}</option>
            {LANGS.map((l) => <option key={l} value={l}>{b.missing(l.toUpperCase())}</option>)}
          </select>
          <label className="adm-check">
            <input type="checkbox" checked={sel.teacherCheck} onChange={(e) => update({ teacherCheck: e.target.checked })} />
            {b.needsCheck}
          </label>
        </div>

        <div className="adm-head">
          <h2>{sel.teacherCheck ? b.needsCheck : topic ? nm(topic, "title", lang)
            : section ? nm(section, "title", lang) : subject ? b.subjGrade(nm(subject, "name", lang), sel.grade) : b.questions}</h2>
          {sel.teacherCheck ? (
            <div className="adm-row">
              <button type="button" className="btn ghost sm" disabled={busy !== null} onClick={exportChecks}>
                {busy === "export" ? b.exporting : b.exportBtn}
              </button>
            </div>
          ) : (
            <div className="adm-row">
              {subject && (
                <>
                  <button type="button" className="btn ghost sm" onClick={() => onImport(subject.id, sel.grade)}>
                    {b.importBtn}
                  </button>
                  <button type="button" className="btn ghost sm" disabled={busy !== null} onClick={() => exportExcel(subject)}>
                    {busy === "export" ? b.exporting : b.exportBtn}
                  </button>
                </>
              )}
              {canPublish && subject && (
                <button type="button" className="btn ghost sm" disabled={busy !== null} onClick={() => publishReady(subject, topic)}>
                  {busy === "publish" ? b.publishing : topic ? b.publishReady : b.publishAll}
                </button>
              )}
              {topic && <button type="button" className="btn sm" onClick={() => onOpen(null, topic.id)}>{b.newQuestion}</button>}
            </div>
          )}
        </div>
        {error !== null && (
          <p className="error" role="alert">{humanError(error, t)}{" "}
            <button type="button" className="link" onClick={() => setError(null)}>×</button></p>
        )}
        {notice && <p className="note" role="status">{notice}</p>}

        {questions === null ? (
          <p className="muted">{b.pickHint}</p>
        ) : questions.length === 0 ? (
          <p className="muted">{b.noneFound}</p>
        ) : (
          <QuestionList items={questions} showTopic={!topic || sel.teacherCheck} onOpen={onOpen} />
        )}
        {questions && questions.length >= 300 && <p className="muted">{b.first300}</p>}
      </section>
    </div>
  );
}

export function QuestionList({ items, showTopic, onOpen }: {
  items: QuestionItem[];
  showTopic: boolean;
  onOpen: (id: string, topicId: string) => void;
}) {
  const { lang, t } = useT();
  return (
    <ol className="adm-qs">
      {items.map((q) => (
        <li key={q.id}>
          <button type="button" onClick={() => onOpen(q.id, q.topic_id)}>
            <span className="qt">{nm(q, "text", lang) || <i>{t.browse.noText}</i>}</span>
            <span className="meta">
              <span className={`st ${q.status}`}>{t.status[q.status]}</span>
              {showTopic && <span>{t.browse.gradeShort(q.topics.grade)} · {nm(q.topics, "title", lang)}</span>}
              {q.teacher_check && <span className="miss" title={q.teacher_check}>{t.browse.checkShort}</span>}
              {LANGS.filter((l) => !(q as unknown as Record<string, string | null>)[`text_${l}`]?.trim())
                .map((l) => <span key={l} className="miss">{t.browse.missShort(l.toUpperCase())}</span>)}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function SubjectForm({ api, subject, nextSort, onDone }: {
  api: AdminApi;
  subject: SubjectRow | null;
  nextSort: number;
  onDone: (saved: boolean) => void;
}) {
  const { t } = useT();
  const f = t.subjectForm;
  const [s, setS] = useState<Omit<SubjectRow, "id">>(subject ?? {
    slug: "", icon: "", name_kk: "", name_ru: "", name_en: "", only_lang: null, sort_order: nextSort,
  });
  const [error, setError] = useState<unknown>(null);
  const set = (p: Partial<typeof s>) => setS({ ...s, ...p });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.saveSubject({ ...s, id: subject?.id });
      onDone(true);
    } catch (err) { setError(err); }
  }

  return (
    <form className="adm-mini" onSubmit={save}>
      <label>{f.slug}<input required pattern="[a-z0-9_-]{1,40}" value={s.slug}
        onChange={(e) => set({ slug: e.target.value })} /></label>
      <label>{f.icon}<input maxLength={8} value={s.icon} onChange={(e) => set({ icon: e.target.value })} /></label>
      {LANGS.map((l) => (
        <label key={l}>{f.name(l.toUpperCase())}<input required value={s[`name_${l}`]}
          onChange={(e) => set({ [`name_${l}`]: e.target.value })} /></label>
      ))}
      <label>{f.onlyLang}
        <select value={s.only_lang ?? ""} onChange={(e) => set({ only_lang: (e.target.value || null) as Lang | null })}>
          <option value="">{f.threeLangs}</option>
          {LANGS.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
        </select>
      </label>
      {error !== null && <p className="error">{humanError(error, t)}</p>}
      <div className="adm-row">
        <button type="submit" className="btn sm">{t.save}</button>
        <button type="button" className="btn ghost sm" onClick={() => onDone(false)}>{t.cancel}</button>
      </div>
    </form>
  );
}

// Название на трёх языках — для раздела и темы. У темы ещё выбор раздела: тема с новым разделом встаёт в его конец.
export function TitleForm({ api, kind, row, base, sections = [], nextSort = 0, onDone }: {
  api: AdminApi;
  kind: "section" | "topic";
  row: SectionRow | TopicRow | null;
  base: Pick<TopicRow, "subject_id" | "grade" | "sort_order"> & { section_id?: string | null };
  sections?: SectionRow[];
  nextSort?: number;
  onDone: (saved: boolean) => void;
}) {
  const { lang, t } = useT();
  const [titles, setTitles] = useState<Record<Lang, string>>({
    kk: row?.title_kk ?? "", ru: row?.title_ru ?? "", en: row?.title_en ?? "",
  });
  const [sectionId, setSectionId] = useState(base.section_id ?? "");
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!LANGS.some((l) => titles[l].trim())) { setError(t.topicForm.needTitle); return; }
    const common = {
      id: row?.id, subject_id: base.subject_id, grade: base.grade, sort_order: base.sort_order,
      title_kk: titles.kk.trim(), title_ru: titles.ru.trim(), title_en: titles.en.trim(),
    };
    try {
      if (kind === "section") await api.saveSection(common);
      else {
        const moved = (sectionId || null) !== (base.section_id ?? null);
        await api.saveTopic({ ...common, section_id: sectionId || null, sort_order: moved ? nextSort : base.sort_order });
      }
      onDone(true);
    } catch (err) { setError(humanError(err, t)); }
  }

  return (
    <form className="adm-mini" onSubmit={save}>
      {LANGS.map((l) => (
        <label key={l}>{t.topicForm.title(l.toUpperCase())}<input value={titles[l]} autoFocus={l === "kk"}
          onChange={(e) => setTitles({ ...titles, [l]: e.target.value })} /></label>
      ))}
      {kind === "topic" && (
        <label>{t.topicForm.section}
          <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">{t.browse.noSection}</option>
            {sections.map((x) => <option key={x.id} value={x.id}>{nm(x, "title", lang)}</option>)}
          </select>
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <div className="adm-row">
        <button type="submit" className="btn sm">{t.save}</button>
        <button type="button" className="btn ghost sm" onClick={() => onDone(false)}>{t.cancel}</button>
      </div>
    </form>
  );
}
