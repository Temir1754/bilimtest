// «Алғашқы қадамдар» (DECISIONS.md №113): пять шагов для нового учителя над экранами админки.
// Галочки ставятся сами — по вопросам, классам, ученикам и заданиям учителя. «Қалай?» раскрывает подсказку.
// Все шаги сделаны или учитель нажал «Жасыру» — блок не показывается; вернуть — пункт в меню аккаунта.
import { useEffect, useState } from "react";
import type { AdminApi, Me } from "./api";
import { useT } from "./lang";
import type { AdminView } from "./route";
import type { Nav } from "./Steps";

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

export interface StartState { add: boolean; publish: boolean; cls: boolean; join: boolean; task: boolean }

export async function loadStart(api: AdminApi, me: Me): Promise<StartState> {
  const [counts, classes] = await Promise.all([api.authorCounts(me.id), api.classes()]);
  const tasks = await Promise.all(classes.map((c) => api.assignments(c.id).then((a) => a.length)));
  return {
    add: counts.draft + counts.review + counts.published > 0,
    publish: counts.published > 0,
    cls: classes.length > 0,
    join: classes.some((c) => (c.students ?? 0) > 0),
    task: tasks.some((n) => n > 0),
  };
}

const ORDER = ["add", "publish", "cls", "join", "task"] as const;
const TARGET: Record<(typeof ORDER)[number], AdminView> = {
  add: { name: "grade" }, publish: { name: "my" }, cls: { name: "classes" }, join: { name: "classes" }, task: { name: "classes" },
};

export function StartGuide({ api, me, nav, onHide }: { api: AdminApi; me: Me; nav: Nav; onHide: () => void }) {
  const { t } = useT();
  const s = t.start;
  const [state, setState] = useState<StartState | null>(null);
  const [min, setMin] = useState(10);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadStart(api, me).then((x) => alive && setState(x), () => {}); // не загрузилось — блок просто не показываем
    api.topicMin().then((m) => alive && setMin(m), () => {});
    return () => { alive = false; };
  }, [api, me]);

  if (!state) return null;
  const done = ORDER.filter((k) => state[k]).length;
  if (done === ORDER.length) return null;
  const next = ORDER.find((k) => !state[k]);

  return (
    <section className="adm-start" aria-labelledby="adm-start-h">
      <div className="adm-start-head">
        <h2 id="adm-start-h">{s.title}</h2>
        <button type="button" className="btn ghost" onClick={() => { setStartHidden(me.id, true); onHide(); }}>{s.hide}</button>
      </div>
      <p className="muted">{s.lede(done, ORDER.length)}</p>
      <ol>
        {ORDER.map((k) => {
          const how = k === "publish" ? s.publish.how(me.trusted === true, min) : s[k].how;
          return (
            <li key={k} className={state[k] ? "done" : k === next ? "next" : undefined}>
              <span className="mark">{state[k] ? "✓" : ""}</span>
              <span className="body">
                <b>{s[k].title}</b>
                {!state[k] && (
                  <span className="acts">
                    <button type="button" className="link" aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}>{s.how}</button>
                    <button type="button" className="link" onClick={() => nav(TARGET[k])}>{s.go} →</button>
                  </span>
                )}
                {open === k && !state[k] && <span className="how">{how}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
