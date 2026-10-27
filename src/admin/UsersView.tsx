import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { GRADES } from "../lib/types";
import {
  humanError, type AdminApi, type Me, type RegionRow, type SchoolRow, type SignupSettings, type SubjectRow, type UserEdit,
  type UserRow, type UserStats,
} from "./api";
import type { Role } from "./form";
import { nm, useT } from "./lang";
import { Go, type Nav } from "./Steps";

const ROLES: Role[] = ["student", "teacher", "admin"];
type Tab = "all" | "teacher" | "student" | "blocked";
const DAY = 86_400_000;

/** Сколько календарных дней назад; null — никогда. */
export function daysAgo(s: string | null, now = new Date()): number | null {
  if (!s) return null;
  const d = new Date(s);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.max(0, Math.round((start(now) - start(d)) / DAY));
}

/** Классы учителя коротко: 5, 6, 7 → «5–7»; 5, 7 → «5, 7». */
export function gradeRange(gs: number[]): string {
  const g = [...gs].sort((a, b) => a - b);
  if (g.length > 2 && g.every((x, i) => i === 0 || x === g[i - 1] + 1)) return `${g[0]}–${g[g.length - 1]}`;
  return g.join(", ");
}

/** Экран админа «Пайдаланушылар» (DECISIONS.md №80–83, №90): плитки, вкладки, поиск, фильтр по школе, таблица
 *  и панель выбранного человека; опасные действия — в свёрнутом блоке, настройки регистрации — в отдельном окне. */
export function UsersView({ api, me, nav }: { api: AdminApi; me: Me; nav: Nav }) {
  const { lang, t } = useT();
  const u = t.users;
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [settings, setSettings] = useState<SignupSettings | null>(null);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [dialog, setDialog] = useState<"create" | "settings" | "edit" | null>(null);
  const [temp, setTemp] = useState<{ who: string; password: string } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const panel = useRef<HTMLElement>(null);

  const load = useCallback(() => {
    api.users({
      search, role: tab === "teacher" || tab === "student" ? tab : undefined, blocked: tab === "blocked" || undefined,
      schoolId: schoolId || undefined,
    }).then(setRows, setError);
  }, [api, search, tab, schoolId]);
  const loadStats = useCallback(() => {
    api.userStats().then(setStats, setError);
    api.settings().then(setSettings, setError);
  }, [api]);
  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);
  useEffect(() => { loadStats(); api.subjects().then(setSubjects, setError); }, [api, loadStats]);

  const who = (r: UserRow) => [r.first_name, r.last_name].filter(Boolean).join(" ") || r.nickname || r.email.split("@")[0];
  const school = (r: UserRow) => (lang === "kk" ? r.school_kk || r.school_ru : r.school_ru || r.school_kk) || r.school_other;
  const subjectNames = (ids: string[] | null) =>
    (ids ?? []).map((id) => subjects.find((s) => s.id === id)).filter(Boolean).map((s) => nm(s!, "name", lang)).join(", ");
  const scope = (r: UserRow) => r.role === "student" ? (r.grade ? u.gradeShort(r.grade) : "")
    : [gradeRange(r.grades ?? []), subjectNames(r.subjects)].filter(Boolean).join(" · ");
  const date = (s: string) => new Date(s).toLocaleDateString(lang === "en" ? "en-GB" : "ru-RU");
  const seen = (r: UserRow) => {
    const d = daysAgo(r.last_sign_in_at);
    return d === null ? u.never : d === 0 ? u.today : d === 1 ? u.yesterday : u.daysAgo(d);
  };
  const stale = (r: UserRow) => { const d = daysAgo(r.last_sign_in_at); return d === null || d > 14; };
  const isNew = (r: UserRow) => (daysAgo(r.created_at) ?? 99) < 7;

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      load();
      loadStats();
    } catch (e) { setError(e); }
  }
  const changeRole = (r: UserRow, next: Role) => confirm(u.confirmRole(who(r), t.roles[next])) && run(() => api.setRole(r.id, next));
  const block = (r: UserRow) => (r.blocked_at || confirm(u.confirmBlock(who(r)))) && run(() => api.setBlocked(r.id, !r.blocked_at));
  const reset = (r: UserRow) => confirm(u.confirmReset(who(r))) && run(async () => {
    const { password } = await api.resetUserPassword(r.id);
    setTemp({ who: who(r), password });
  });
  function pick(r: UserRow) {
    setPicked(r.id);
    // На телефоне панель — под таблицей: прокручиваем к ней.
    if (window.matchMedia?.("(max-width: 1000px)").matches) setTimeout(() => panel.current?.scrollIntoView?.({ block: "start" }));
  }

  const sel = rows?.find((r) => r.id === picked) ?? null;
  const tile = (key: Tab, n: number | undefined, label: string, sub?: string) => (
    <button type="button" className="us-tile" aria-pressed={tab === key} onClick={() => setTab(tab === key ? "all" : key)}>
      <b>{n ?? "…"}</b><span>{label}</span>{sub && <small>{sub}</small>}
    </button>
  );

  return (
    <div className={sel ? "us-page with-panel" : "us-page"}>
      <div className="us-main">
        <div className="us-head">
          <h1>{u.title}</h1>
          <span className="us-head-btns">
            <button type="button" className="btn ghost" onClick={() => setDialog("settings")}>{u.settingsBtn}</button>
            <button type="button" className="btn" onClick={() => { setDialog("create"); setTemp(null); }}>{u.create}</button>
          </span>
        </div>

        {settings?.teacher && !settings.mail && (
          <div className="us-warn" role="status">
            <span aria-hidden="true">⚠</span>
            <p><b>{u.warn.on}</b>{u.warn.rest}</p>
            <button type="button" className="btn sm" onClick={() => run(async () => {
              await api.saveSettings({ ...settings, teacher: false });
            })}>{u.warn.off}</button>
          </div>
        )}
        {temp && <TempPassword {...temp} onClose={() => setTemp(null)} />}

        <div className="us-tiles">
          {tile("teacher", stats?.teachers, u.tiles.teachers, stats ? u.tiles.week(stats.teachers_week) : undefined)}
          {tile("student", stats?.students, u.tiles.students, stats ? u.tiles.week(stats.students_week) : undefined)}
          <Go to={{ name: "review" }} nav={nav} className="us-tile">
            <b>{stats?.review ?? "…"}</b><span>{u.tiles.review}</span><small>{u.tiles.reviewSub}</small>
          </Go>
          {tile("blocked", stats?.blocked, u.tiles.blocked)}
        </div>

        <div className="us-filters">
          <div className="us-tabs" role="group" aria-label={u.tabsLabel}>
            {(["all", "teacher", "student", "blocked"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{u.tabs[k]}</button>
            ))}
          </div>
          <input type="search" placeholder={u.search} aria-label={u.search} value={search} onChange={(e) => setSearch(e.target.value)} />
          <select aria-label={u.allSchools} value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            <option value="">{u.allSchools}</option>
            {stats?.schools.map((s) => <option key={s.id} value={s.id}>{lang === "kk" ? s.name_kk || s.name_ru : s.name_ru || s.name_kk}</option>)}
          </select>
        </div>

        {error !== null && (
          <p className="error" role="alert">{humanError(error, t)}{" "}
            <button type="button" className="link" onClick={() => setError(null)}>×</button></p>
        )}
        {rows === null ? <p className="loading">{t.loading}</p> : rows.length === 0 ? <p className="muted">{u.none}</p> : (
          <div className="us-table-wrap">
            <table className="us-table">
              <thead><tr>
                <th>{u.cols.name}</th><th>{u.cols.school}</th><th>{u.cols.scope}</th><th>{u.cols.seen}</th><th />
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={r.id === picked ? "on" : undefined} onClick={() => pick(r)}>
                    <td>
                      <span className="us-person">
                        <span className="us-ava" aria-hidden="true">{who(r).charAt(0).toUpperCase()}</span>
                        <span className="us-who">
                          <b>{who(r)}</b>
                          {r.id === me.id && <span className="muted"> ({u.you})</span>}
                          {isNew(r) && <span className="st published">{u.isNew}</span>}
                          {r.role === "admin" && <span className="st review">{t.roles.admin}</span>}
                          {r.blocked_at && <span className="st returned">{u.blocked}</span>}
                          {r.must_change_password && <span className="st draft">{u.mustChange}</span>}
                          <small>{r.email.endsWith("@students.bilimtest.local") ? u.studentLogin : r.email}</small>
                        </span>
                      </span>
                    </td>
                    <td>{school(r) || "—"}</td>
                    <td>{scope(r) || "—"}</td>
                    <td className={stale(r) ? "us-stale" : undefined}>{seen(r)}</td>
                    <td>
                      <button type="button" className="us-more" aria-label={u.more(who(r))}
                        onClick={(e) => { e.stopPropagation(); pick(r); }}>⋯</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {sel && (
        <aside className="us-panel" ref={panel} aria-label={who(sel)}>
          <button type="button" className="us-close" aria-label={u.close} onClick={() => setPicked(null)}>×</button>
          <div className="us-person">
            <span className="us-ava big" aria-hidden="true">{who(sel).charAt(0).toUpperCase()}</span>
            <span className="us-who">
              <h2>{who(sel)}</h2>
              <small>{u.since(t.roles[sel.role], date(sel.created_at))}</small>
            </span>
          </div>
          <dl className="us-facts">
            {sel.nickname && who(sel) !== sel.nickname && <><dt>{t.users.form.nick.replace(/ \(.*/, "")}</dt><dd>{sel.nickname}</dd></>}
            <dt>Email</dt><dd>{sel.email.endsWith("@students.bilimtest.local") ? u.studentLogin : sel.email}</dd>
            <dt>{u.school}</dt><dd>{school(sel) || "—"}</dd>
            {sel.role === "teacher" && <>
              <dt>{u.grades}</dt><dd>{(sel.grades ?? []).join(", ") || "—"}</dd>
              <dt>{u.subjects}</dt><dd>{subjectNames(sel.subjects) || "—"}</dd>
            </>}
            {sel.role === "student" && <><dt>{u.grade}</dt><dd>{sel.grade ?? "—"}</dd></>}
            <dt>{u.lastSeen}</dt><dd className={stale(sel) ? "us-stale" : undefined}>{seen(sel)}</dd>
          </dl>
          {sel.role !== "student" && (
            <div className="us-counts">
              <span><b>{sel.q_total}</b>{u.q.total}</span>
              <span className="q-review"><b>{sel.q_review}</b>{u.q.review}</span>
              <span className="q-pub"><b>{sel.q_published}</b>{u.q.published}</span>
            </div>
          )}
          <div className="us-actions">
            {sel.role !== "student" && <Go to={{ name: "author", id: sel.id }} nav={nav} className="btn ghost">{u.viewQs}</Go>}
            <button type="button" className="btn ghost" onClick={() => setDialog("edit")}>{u.edit}</button>
            {sel.id !== me.id && <button type="button" className="btn ghost" onClick={() => reset(sel)}>{u.reset}</button>}
          </div>
          {sel.id !== me.id && <Danger key={sel.id} row={sel} onRole={(r) => changeRole(sel, r)} onBlock={() => block(sel)} />}
        </aside>
      )}

      {dialog === "settings" && (
        <Modal title={u.settings.title} onClose={() => setDialog(null)}>
          <SettingsPanel api={api} onSaved={loadStats} />
        </Modal>
      )}
      {dialog === "create" && (
        <Modal title={u.form.title} onClose={() => setDialog(null)}>
          <CreateTeacher api={api} onCreated={(name, password) => { setDialog(null); setTemp({ who: name, password }); load(); loadStats(); }}
            onCancel={() => setDialog(null)} />
        </Modal>
      )}
      {dialog === "edit" && sel && (
        <Modal title={u.editTitle(who(sel))} onClose={() => setDialog(null)}>
          <EditUser api={api} row={sel} onSaved={() => { setDialog(null); load(); }} onCancel={() => setDialog(null)} />
        </Modal>
      )}
    </div>
  );
}

/** «Қауіпті әрекеттер»: свёрнуто; смена роли и блокировка — с подтверждением. */
function Danger({ row, onRole, onBlock }: { row: UserRow; onRole: (r: Role) => void; onBlock: () => void }) {
  const { t } = useT();
  const u = t.users;
  const [roleOpen, setRoleOpen] = useState(false);
  const [role, setRole] = useState<Role>(row.role);
  return (
    <details className="us-danger">
      <summary>{u.danger}</summary>
      {roleOpen ? (
        <div className="us-role">
          <label>{u.newRole}
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((x) => <option key={x} value={x}>{t.roles[x]}</option>)}
            </select>
          </label>
          <span className="adm-row">
            <button type="button" className="btn sm" disabled={role === row.role} onClick={() => onRole(role)}>{u.apply}</button>
            <button type="button" className="btn ghost sm" onClick={() => setRoleOpen(false)}>{t.cancel}</button>
          </span>
        </div>
      ) : (
        <button type="button" className="btn ghost" onClick={() => setRoleOpen(true)}>{u.changeRole}</button>
      )}
      <button type="button" className={row.blocked_at ? "btn ghost" : "btn ghost danger"} onClick={onBlock}>
        {row.blocked_at ? u.unblock : u.blockDots}
      </button>
    </details>
  );
}

/** Окно поверх экрана: Esc и фон закрывают, фокус — внутрь окна. */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useT();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>("input, select, button:not(.us-close)")?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("keydown", esc); back?.focus?.(); };
  }, [onClose]);
  return (
    <div className="us-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="us-modal" role="dialog" aria-modal="true" aria-label={title} ref={box}>
        <div className="us-modal-head">
          <h2>{title}</h2>
          <button type="button" className="us-close" aria-label={t.users.close} onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Временный пароль — показывается один раз; админ передаёт его сам. */
function TempPassword({ who, password, onClose }: { who: string; password: string; onClose: () => void }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="note adm-temp" role="status">
      <b>{t.users.tempTitle}:</b> <code>{password}</code>{" "}
      <button type="button" className="link" onClick={() => navigator.clipboard?.writeText(password).then(() => setCopied(true))}>
        {copied ? t.users.copied : t.users.copy}
      </button>
      <p>{t.users.tempNote(who)}</p>
      <button type="button" className="btn ghost sm" onClick={onClose}>OK</button>
    </div>
  );
}

const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

/** Школа: область → район/город → школа из справочника или «нет в списке». Начальные значения — у «Деректерін өзгерту». */
function SchoolFields({ api, start, onChange, onError }: {
  api: AdminApi;
  start?: { region: string | null; school: string | null; other: string | null };
  onChange: (v: { school_id: string | null; school_other: string }) => void;
  onError: (e: unknown) => void;
}) {
  const { lang, t } = useT();
  const f = t.users.form;
  const [regions, setRegions] = useState<RegionRow[]>([]);
  const [regionId, setRegionId] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [schoolId, setSchoolId] = useState(start?.school ?? (start?.other ? "other" : "")); // "other" — вписать вручную
  const [other, setOther] = useState(start?.other ?? "");
  const name = (x: { name_kk: string; name_ru: string }) => (lang === "kk" ? x.name_kk || x.name_ru : x.name_ru || x.name_kk);

  useEffect(() => {
    api.regions().then((rs) => {
      setRegions(rs);
      // Регион школы может быть районом: тогда сверху — его область.
      const at = rs.find((r) => r.id === start?.region);
      if (at) { setRegionId(at.parent_id ?? at.id); setPlaceId(at.parent_id ? at.id : ""); }
    }, onError);
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const at = placeId || regionId;
    if (!at) { setSchools([]); return; }
    api.schools(at).then((s) => setSchools(s.filter((x) => x.approved)), onError);
  }, [api, regionId, placeId, onError]);
  useEffect(() => {
    onChange({ school_id: schoolId === "other" || !schoolId ? null : schoolId, school_other: schoolId === "other" ? other : "" });
  }, [schoolId, other]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="adm-row grow">
        <label>{f.region}
          <select value={regionId} onChange={(e) => { setRegionId(e.target.value); setPlaceId(""); setSchoolId(""); }}>
            <option value="">{f.pick}</option>
            {regions.filter((r) => !r.parent_id).map((r) => <option key={r.id} value={r.id}>{name(r)}</option>)}
          </select>
        </label>
        <label>{f.place}
          <select value={placeId} disabled={!regionId} onChange={(e) => { setPlaceId(e.target.value); setSchoolId(""); }}>
            <option value="">{f.whole}</option>
            {regions.filter((r) => r.parent_id === regionId).map((r) => <option key={r.id} value={r.id}>{name(r)}</option>)}
          </select>
        </label>
        <label>{f.school}
          <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            <option value="">{f.pick}</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{name(s)}</option>)}
            <option value="other">{f.other}</option>
          </select>
        </label>
      </div>
      {schoolId === "other" && <label>{f.otherName}<input required value={other} onChange={(e) => setOther(e.target.value)} /></label>}
    </>
  );
}

/** Классы и предметы учителя: предметы — только те, что есть в выбранных классах (по программе в базе). */
function ScopeFields({ api, grades, picked, setGrades, setPicked, onError }: {
  api: AdminApi; grades: number[]; picked: string[];
  setGrades: (g: number[]) => void; setPicked: (f: (p: string[]) => string[]) => void; onError: (e: unknown) => void;
}) {
  const { lang, t } = useT();
  const f = t.users.form;
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [inGrades, setInGrades] = useState<string[]>([]);
  useEffect(() => { api.subjects().then(setSubjects, onError); }, [api, onError]);
  useEffect(() => {
    Promise.all(grades.map((g) => api.gradeSubjects(g))).then((lists) => {
      const ids = [...new Set(lists.flat())];
      setInGrades(ids);
      setPicked((p) => p.filter((id) => ids.includes(id)));
    }, onError);
  }, [api, grades, setPicked, onError]);
  return (
    <>
      <fieldset className="adm-chips">
        <legend>{f.grades}</legend>
        {GRADES.map((g) => (
          <button key={g} type="button" aria-pressed={grades.includes(g)} onClick={() => setGrades(toggle(grades, g))}>{g}</button>
        ))}
      </fieldset>
      <fieldset className="adm-chips">
        <legend>{f.subjects}</legend>
        {grades.length === 0 ? <p className="muted">{f.pickGrades}</p> : subjects.filter((s) => inGrades.includes(s.id)).map((s) => (
          <button key={s.id} type="button" aria-pressed={picked.includes(s.id)} onClick={() => setPicked((p) => toggle(p, s.id))}>
            {nm(s, "name", lang)}
          </button>
        ))}
      </fieldset>
    </>
  );
}

function CreateTeacher({ api, onCreated, onCancel }: {
  api: AdminApi; onCreated: (name: string, password: string) => void; onCancel: () => void;
}) {
  const { t } = useT();
  const f = t.users.form;
  const [v, setV] = useState({ first_name: "", last_name: "", nickname: "", email: "" });
  const [where, setWhere] = useState<{ school_id: string | null; school_other: string }>({ school_id: null, school_other: "" });
  const [grades, setGrades] = useState<number[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof v>) => setV({ ...v, ...p });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { password } = await api.createTeacher(v.email, {
        nickname: v.nickname, first_name: v.first_name, last_name: v.last_name, ...where, subjects: picked, grades,
      });
      onCreated(v.nickname.trim().toLowerCase() || v.email, password);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="adm-mini adm-create" onSubmit={submit}>
      <div className="adm-row grow">
        <label>{f.first}<input required value={v.first_name} onChange={(e) => set({ first_name: e.target.value })} /></label>
        <label>{f.last}<input required value={v.last_name} onChange={(e) => set({ last_name: e.target.value })} /></label>
      </div>
      <div className="adm-row grow">
        <label>{f.nick}<input required pattern="[A-Za-z0-9_.]{3,20}" autoCapitalize="none" value={v.nickname}
          onChange={(e) => set({ nickname: e.target.value })} /></label>
        <label>{f.email}<input required type="email" value={v.email} onChange={(e) => set({ email: e.target.value })} /></label>
      </div>
      <SchoolFields api={api} onChange={setWhere} onError={setError} />
      <ScopeFields api={api} grades={grades} picked={picked} setGrades={setGrades} setPicked={setPicked} onError={setError} />
      {error !== null && <p className="error" role="alert">{humanError(error, t)}</p>}
      <div className="adm-row">
        <button type="submit" className="btn sm" disabled={busy}>{busy ? f.busy : f.submit}</button>
        <button type="button" className="btn ghost sm" onClick={onCancel}>{t.cancel}</button>
      </div>
    </form>
  );
}

/** «Деректерін өзгерту»: имя, школа; учителю — классы и предметы, ученику — класс. Ник и email не меняются. */
function EditUser({ api, row, onSaved, onCancel }: { api: AdminApi; row: UserRow; onSaved: () => void; onCancel: () => void }) {
  const { t } = useT();
  const f = t.users.form;
  const [v, setV] = useState({ first_name: row.first_name, last_name: row.last_name });
  const [where, setWhere] = useState({ school_id: row.school_id, school_other: row.school_other ?? "" });
  const [grades, setGrades] = useState<number[]>(row.grades ?? []);
  const [picked, setPicked] = useState<string[]>(row.subjects ?? []);
  const [grade, setGrade] = useState(row.grade ?? 0);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const teacher = row.role === "teacher";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data: UserEdit = { ...v, ...where };
      if (teacher) Object.assign(data, { subjects: picked, grades });
      if (row.role === "student" && grade) data.grade = grade;
      await api.updateUser(row.id, data);
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="adm-mini adm-create" onSubmit={submit}>
      <div className="adm-row grow">
        <label>{f.first}<input required={teacher} value={v.first_name} onChange={(e) => setV({ ...v, first_name: e.target.value })} /></label>
        <label>{f.last}<input required={teacher} value={v.last_name} onChange={(e) => setV({ ...v, last_name: e.target.value })} /></label>
      </div>
      <SchoolFields api={api} start={{ region: row.school_region, school: row.school_id, other: row.school_other }}
        onChange={setWhere} onError={setError} />
      {teacher && <ScopeFields api={api} grades={grades} picked={picked} setGrades={setGrades} setPicked={setPicked} onError={setError} />}
      {row.role === "student" && (
        <fieldset className="adm-chips">
          <legend>{t.users.grade}</legend>
          {GRADES.map((g) => <button key={g} type="button" aria-pressed={grade === g} onClick={() => setGrade(g)}>{g}</button>)}
        </fieldset>
      )}
      {error !== null && <p className="error" role="alert">{humanError(error, t)}</p>}
      <div className="adm-row">
        <button type="submit" className="btn sm" disabled={busy}>{busy ? t.saving : t.save}</button>
        <button type="button" className="btn ghost sm" onClick={onCancel}>{t.cancel}</button>
      </div>
    </form>
  );
}

/** Переключатели регистрации и лимиты (№74, №79, №83, №90). */
function SettingsPanel({ api, onSaved }: { api: AdminApi; onSaved: () => void }) {
  const { t } = useT();
  const s = t.users.settings;
  const [v, setV] = useState<SignupSettings | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { api.settings().then(setV, setError); }, [api]);
  if (!v) return error !== null ? <p className="error">{humanError(error, t)}</p> : <p className="loading">{t.loading}</p>;
  const set = (p: Partial<SignupSettings>) => { setV({ ...v, ...p }); setSaved(false); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.saveSettings(v!);
      setSaved(true);
      onSaved();
    } catch (err) { setError(err); }
  }

  return (
    <form className="adm-mini adm-settings" onSubmit={save}>
      <label className="adm-check"><input type="checkbox" checked={v.student} onChange={(e) => set({ student: e.target.checked })} />
        {s.student}</label>
      <label className="adm-check"><input type="checkbox" checked={v.teacher} onChange={(e) => set({ teacher: e.target.checked })} />
        {s.teacher} <span className="muted">— {s.teacherWarn}</span></label>
      <label className="adm-check"><input type="checkbox" checked={v.mail} onChange={(e) => set({ mail: e.target.checked })} />
        {s.mail}</label>
      <div className="adm-row grow">
        <label>{s.drafts}<input type="number" min={1} max={1000} value={v.teacher_drafts_per_day}
          onChange={(e) => set({ teacher_drafts_per_day: Number(e.target.value) })} /></label>
        <label>{s.imports}<input type="number" min={1} max={2000} value={v.teacher_imports_per_day}
          onChange={(e) => set({ teacher_imports_per_day: Number(e.target.value) })} /></label>
        <label>{s.signups}<input type="number" min={1} max={1000} value={v.student_signups_per_hour}
          onChange={(e) => set({ student_signups_per_hour: Number(e.target.value) })} /></label>
        <label>{s.topicMin}<input type="number" min={1} max={100} value={v.topic_min_questions}
          onChange={(e) => set({ topic_min_questions: Number(e.target.value) })} /></label>
      </div>
      {error !== null && <p className="error" role="alert">{humanError(error, t)}</p>}
      {saved && <p className="note" role="status">{s.saved}</p>}
      <div className="adm-row"><button type="submit" className="btn sm">{t.save}</button></div>
    </form>
  );
}
