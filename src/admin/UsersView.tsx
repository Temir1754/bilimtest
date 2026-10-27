import { useCallback, useEffect, useState } from "react";
import { GRADES } from "../lib/types";
import {
  humanError, type AdminApi, type Me, type RegionRow, type SchoolRow, type SignupSettings, type SubjectRow, type UserRow,
} from "./api";
import type { Role } from "./form";
import { nm, useT } from "./lang";

const ROLES: Role[] = ["student", "teacher", "admin"];

/** Экран админа «Пользователи» (DECISIONS.md №80–83): список, роль, блокировка, сброс пароля,
 *  создание учителя с временным паролем, настройки регистрации. */
export function UsersView({ api, me }: { api: AdminApi; me: Me }) {
  const { lang, t } = useT();
  const u = t.users;
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [creating, setCreating] = useState(false);
  const [temp, setTemp] = useState<{ who: string; password: string } | null>(null);

  const load = useCallback(() => {
    api.users({ search, role: role || undefined, blocked: blockedOnly || undefined }).then(setRows, setError);
  }, [api, search, role, blockedOnly]);
  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const who = (r: UserRow) => r.nickname || [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email;
  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      load();
    } catch (e) { setError(e); }
  }
  const changeRole = (r: UserRow, next: Role) => confirm(u.confirmRole(who(r), t.roles[next])) && run(() => api.setRole(r.id, next));
  const block = (r: UserRow) => (r.blocked_at || confirm(u.confirmBlock(who(r)))) && run(() => api.setBlocked(r.id, !r.blocked_at));
  const reset = (r: UserRow) => confirm(u.confirmReset(who(r))) && run(async () => {
    const { password } = await api.resetUserPassword(r.id);
    setTemp({ who: who(r), password });
  });
  const date = (s: string | null) => (s ? new Date(s).toLocaleDateString(lang === "en" ? "en-GB" : "ru-RU") : u.never);

  return (
    <div className="adm-main adm-users">
      <div className="adm-head">
        <h2>{u.title}</h2>
        <button type="button" className="btn sm" onClick={() => { setCreating(!creating); setTemp(null); }}>{u.create}</button>
      </div>
      {temp && <TempPassword {...temp} onClose={() => setTemp(null)} />}
      {creating && (
        <CreateTeacher api={api} onCreated={(name, password) => { setCreating(false); setTemp({ who: name, password }); load(); }}
          onCancel={() => setCreating(false)} />
      )}
      <div className="adm-filters">
        <input type="search" placeholder={u.search} aria-label={u.search} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label={u.role} value={role} onChange={(e) => setRole(e.target.value as Role | "")}>
          <option value="">{u.anyRole}</option>
          {ROLES.map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
        </select>
        <label className="adm-check">
          <input type="checkbox" checked={blockedOnly} onChange={(e) => setBlockedOnly(e.target.checked)} />{u.blockedOnly}
        </label>
      </div>
      {error !== null && (
        <p className="error" role="alert">{humanError(error, t)}{" "}
          <button type="button" className="link" onClick={() => setError(null)}>×</button></p>
      )}
      {rows === null ? <p className="loading">{t.loading}</p> : rows.length === 0 ? <p className="muted">{u.none}</p> : (
        <ol className="adm-qs">
          {rows.map((r) => {
            const self = r.id === me.id;
            const school = (lang === "kk" ? r.school_kk || r.school_ru : r.school_ru || r.school_kk) || r.school_other;
            return (
              <li key={r.id} className="adm-school">
                <span className="qt">
                  <b>{r.nickname ?? r.email.split("@")[0]}</b>
                  {(r.first_name || r.last_name) && ` · ${r.first_name} ${r.last_name}`.trimEnd()}
                  {self && <span className="muted"> ({u.you})</span>}
                </span>
                <span className="meta">
                  <span>{r.email.endsWith("@students.bilimtest.local") ? u.studentLogin : r.email}</span>
                  {r.grade && <span>{u.gradeShort(r.grade)}</span>}
                  {school && <span>{school}</span>}
                  <span>{u.created}: {date(r.created_at)}</span>
                  <span>{u.lastSeen}: {date(r.last_sign_in_at)}</span>
                  {r.blocked_at && <span className="st draft">{u.blocked}</span>}
                  {r.must_change_password && <span className="st review">{u.mustChange}</span>}
                </span>
                <span className="adm-row">
                  <select aria-label={`${u.role}: ${who(r)}`} value={r.role} disabled={self}
                    onChange={(e) => changeRole(r, e.target.value as Role)}>
                    {ROLES.map((x) => <option key={x} value={x}>{t.roles[x]}</option>)}
                  </select>
                  {!self && <button type="button" className="link" onClick={() => reset(r)}>{u.reset}</button>}
                  {!self && (
                    <button type="button" className={r.blocked_at ? "link" : "link danger"} onClick={() => block(r)}>
                      {r.blocked_at ? u.unblock : u.block}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <SettingsPanel api={api} />
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

function CreateTeacher({ api, onCreated, onCancel }: {
  api: AdminApi; onCreated: (name: string, password: string) => void; onCancel: () => void;
}) {
  const { lang, t } = useT();
  const f = t.users.form;
  const [v, setV] = useState({ first_name: "", last_name: "", nickname: "", email: "", school_other: "" });
  const [regions, setRegions] = useState<RegionRow[]>([]);
  const [regionId, setRegionId] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [schoolId, setSchoolId] = useState(""); // "other" — вписать вручную
  const [grades, setGrades] = useState<number[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [inGrades, setInGrades] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const name = (x: { name_kk: string; name_ru: string }) => (lang === "kk" ? x.name_kk || x.name_ru : x.name_ru || x.name_kk);
  const set = (p: Partial<typeof v>) => setV({ ...v, ...p });

  useEffect(() => { api.regions().then(setRegions, setError); api.subjects().then(setSubjects, setError); }, [api]);
  useEffect(() => {
    const at = placeId || regionId;
    if (!at) { setSchools([]); return; }
    api.schools(at).then((s) => setSchools(s.filter((x) => x.approved)), setError);
  }, [api, regionId, placeId]);
  // Предметы — только те, что есть в выбранных классах (по программе в базе).
  useEffect(() => {
    Promise.all(grades.map((g) => api.gradeSubjects(g))).then((lists) => {
      const ids = [...new Set(lists.flat())];
      setInGrades(ids);
      setPicked((p) => p.filter((id) => ids.includes(id)));
    }, setError);
  }, [api, grades]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const other = schoolId === "other";
      const { password } = await api.createTeacher(v.email, {
        nickname: v.nickname, first_name: v.first_name, last_name: v.last_name,
        school_id: other || !schoolId ? null : schoolId, school_other: other ? v.school_other : "",
        subjects: picked, grades,
      });
      onCreated(v.nickname.trim().toLowerCase() || v.email, password);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  return (
    <form className="adm-mini adm-create" onSubmit={submit}>
      <h3>{f.title}</h3>
      <div className="adm-row grow">
        <label>{f.first}<input required value={v.first_name} onChange={(e) => set({ first_name: e.target.value })} /></label>
        <label>{f.last}<input required value={v.last_name} onChange={(e) => set({ last_name: e.target.value })} /></label>
      </div>
      <div className="adm-row grow">
        <label>{f.nick}<input required pattern="[A-Za-z0-9_.]{3,20}" autoCapitalize="none" value={v.nickname}
          onChange={(e) => set({ nickname: e.target.value })} /></label>
        <label>{f.email}<input required type="email" value={v.email} onChange={(e) => set({ email: e.target.value })} /></label>
      </div>
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
      {schoolId === "other" && (
        <label>{f.otherName}<input required value={v.school_other} onChange={(e) => set({ school_other: e.target.value })} /></label>
      )}
      <fieldset className="adm-chips">
        <legend>{f.grades}</legend>
        {GRADES.map((g) => (
          <button key={g} type="button" aria-pressed={grades.includes(g)} onClick={() => setGrades(toggle(grades, g))}>{g}</button>
        ))}
      </fieldset>
      <fieldset className="adm-chips">
        <legend>{f.subjects}</legend>
        {grades.length === 0 ? <p className="muted">{f.pickGrades}</p> : subjects.filter((s) => inGrades.includes(s.id)).map((s) => (
          <button key={s.id} type="button" aria-pressed={picked.includes(s.id)} onClick={() => setPicked(toggle(picked, s.id))}>
            {nm(s, "name", lang)}
          </button>
        ))}
      </fieldset>
      {error !== null && <p className="error" role="alert">{humanError(error, t)}</p>}
      <div className="adm-row">
        <button type="submit" className="btn sm" disabled={busy}>{busy ? f.busy : f.submit}</button>
        <button type="button" className="btn ghost sm" onClick={onCancel}>{t.cancel}</button>
      </div>
    </form>
  );
}

/** Переключатели регистрации и лимиты (№74, №79, №83). */
function SettingsPanel({ api }: { api: AdminApi }) {
  const { t } = useT();
  const s = t.users.settings;
  const [v, setV] = useState<SignupSettings | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { api.settings().then(setV, setError); }, [api]);
  if (!v) return error !== null ? <p className="error">{humanError(error, t)}</p> : null;
  const set = (p: Partial<SignupSettings>) => { setV({ ...v, ...p }); setSaved(false); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.saveSettings(v!);
      setSaved(true);
    } catch (err) { setError(err); }
  }

  return (
    <form className="adm-mini adm-settings" onSubmit={save}>
      <h3>{s.title}</h3>
      <label className="adm-check"><input type="checkbox" checked={v.student} onChange={(e) => set({ student: e.target.checked })} />
        {s.student}</label>
      <label className="adm-check"><input type="checkbox" checked={v.teacher} onChange={(e) => set({ teacher: e.target.checked })} />
        {s.teacher} <span className="muted">— {s.teacherWarn}</span></label>
      <div className="adm-row grow">
        <label>{s.drafts}<input type="number" min={1} max={1000} value={v.teacher_drafts_per_day}
          onChange={(e) => set({ teacher_drafts_per_day: Number(e.target.value) })} /></label>
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
