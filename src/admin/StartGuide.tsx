// «Алғашқы қадамдар» (DECISIONS.md №113, компактный вид — №123): над экранами админки нового учителя.
// Видно только следующий шаг с кнопкой-действием; полный список из пяти — по кнопке «Барлық 5 қадам».
// Галочки ставятся сами — по вопросам, классам, ученикам и заданиям учителя. «Қалай?» раскрывает подсказку.
// Все шаги сделаны или учитель нажал «Жасыру» — блок не показывается; вернуть — пункт в меню аккаунта.
import { useEffect, useState } from "react";
import type { AdminApi, Me } from "./api";
import { useT } from "./lang";
import type { AdminView } from "./route";
import { Go, type Nav } from "./Steps";

const KEY = "bt-start-hidden";

/** Учитель скрыл блок (по id: на одном компьютере могут входить разные учителя). */
export const startHidden = (id: string) => {
  try { return (JSON.parse(localStorage.getItem(KEY) || "[]") as string[]).includes(id); } catch { return false; }
};
export function setStartHidden(id: string, hidden: boolean) {
  try {
    const list = (JSON.parse(localStorage.getItem(KEY) || "[]") as string[]).filter((x) => x !== id);
    localStorage.setItem(KEY, JSON.stringify(hidden ? [...list, id] : list));
  } catch { /* приватный режим — блок просто снова появится */ }
}

export interface StartState {
  add: boolean; publish: boolean; cls: boolean; join: boolean; task: boolean;
  /** Класс для кнопок «код» и «задание»: с учениками, иначе первый. */
  classId?: string;
}

export async function loadStart(api: AdminApi, me: Me): Promise<StartState> {
  const [counts, classes] = await Promise.all([api.authorCounts(me.id), api.classes()]);
  const tasks = await Promise.all(classes.map((c) => api.assignments(c.id).then((a) => a.length)));
  return {
    add: counts.draft + counts.review + counts.published > 0,
    publish: counts.published > 0,
    cls: classes.length > 0,
    join: classes.some((c) => (c.students ?? 0) > 0),
    task: tasks.some((n) => n > 0),
    classId: (classes.find((c) => (c.students ?? 0) > 0) ?? classes[0])?.id,
  };
}

const ORDER = ["add", "publish", "cls", "join", "task"] as const;
type Step = (typeof ORDER)[number];
/** Куда ведёт кнопка шага: код класса — памятка с кодом и QR, задание — страница класса (там «Тапсырмалар»). */
function target(k: Step, classId?: string): AdminView {
  if (k === "add") return { name: "grade" };
  if (k === "publish") return { name: "my" };
  if (k === "join" && classId) return { name: "memo", id: classId };
  if (k === "task" && classId) return { name: "class", id: classId };
  return { name: "classes" };
}
/** Статья «Нұсқаулық» к шагу (№114). */
const ARTICLE: Record<Step, string> = { add: "add", publish: "status", cls: "class", join: "class", task: "task" };

export function StartGuide({ api, me, nav, onHide }: { api: AdminApi; me: Me; nav: Nav; onHide: () => void }) {
  const { t } = useT();
  const s = t.start;
  const [state, setState] = useState<StartState | null>(null);
  const [min, setMin] = useState(10);
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let alive = true;
    loadStart(api, me).then((x) => alive && setState(x), () => {}); // не загрузилось — блок просто не показываем
    api.topicMin().then((m) => alive && setMin(m), () => {});
    return () => { alive = false; };
  }, [api, me]);

  if (!state) return null;
  const done = ORDER.filter((k) => state[k]).length;
  const next = ORDER.find((k) => !state[k]);
  if (!next) return null;
  const how = (k: Step) => (k === "publish" ? s.publish.how(me.trusted === true, min) : s[k].how);
  const howText = (k: Step) => (
    <span className="how">{how(k)} <Go to={{ name: "help", id: ARTICLE[k] }} nav={nav}>{s.more} →</Go></span>
  );

  return (
    <section className="adm-start" aria-labelledby="adm-start-h">
      <div className="adm-start-head">
        <h2 id="adm-start-h">{s.title}</h2>
        <span className="adm-start-count">{done} / {ORDER.length}</span>
        <button type="button" className="link" onClick={() => { setStartHidden(me.id, true); onHide(); }}>{s.hide}</button>
      </div>
      <div className="adm-start-bar" role="progressbar" aria-label={s.progress(done, ORDER.length)}
        aria-valuemin={0} aria-valuemax={ORDER.length} aria-valuenow={done}><i style={{ width: `${(done / ORDER.length) * 100}%` }} /></div>

      {!all ? (
        <div className="adm-start-next">
          <span className="kick">{s.next(ORDER.indexOf(next) + 1, ORDER.length)}</span>
          <b>{s[next].title}</b>
          <div className="acts">
            <button type="button" className="btn" onClick={() => nav(target(next, state.classId))}>{s.btn[next]} →</button>
            <button type="button" className="link" aria-expanded={open === next} onClick={() => setOpen(open === next ? null : next)}>{s.how}</button>
          </div>
          {open === next && howText(next)}
        </div>
      ) : (
        <>
          <p className="muted">{s.lede(done, ORDER.length)}</p>
          <ol>
            {ORDER.map((k) => (
              <li key={k} className={state[k] ? "done" : k === next ? "next" : undefined}>
                <span className="mark" aria-hidden="true">{state[k] ? "✓" : ""}</span>
                <span className="body">
                  <b>{s[k].title}<span className="sr">, {state[k] ? s.doneMark : s.todoMark}</span></b>
                  {!state[k] && (
                    <span className="acts">
                      <button type="button" className="link" aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}>{s.how}</button>
                      <button type="button" className="link" onClick={() => nav(target(k, state.classId))}>{s.btn[k]} →</button>
                    </span>
                  )}
                  {open === k && !state[k] && howText(k)}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
      <button type="button" className="link adm-start-all" aria-expanded={all} onClick={() => setAll(!all)}>
        {all ? s.less : s.all(ORDER.length)}
      </button>
    </section>
  );
}
