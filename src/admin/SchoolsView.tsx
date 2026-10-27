import { useCallback, useEffect, useState } from "react";
import { humanError, type AdminApi, type RegionRow, type SchoolRow } from "./api";
import { useT } from "./lang";

/** Экран админа «Школы»: справочник для регистрации — область → районы и города → школы (DECISIONS.md №77).
 *  Области и города республиканского значения уже в базе; остальное админ добавляет вручную. */
export function SchoolsView({ api }: { api: AdminApi }) {
  const { lang, t } = useT();
  const s = t.schools;
  const [regions, setRegions] = useState<RegionRow[]>([]);
  const [topId, setTopId] = useState("");
  const [placeId, setPlaceId] = useState(""); // пусто — школы самой области или города
  const [schools, setSchools] = useState<SchoolRow[] | null>(null);
  const [editing, setEditing] = useState<"place-new" | "place" | "school-new" | string | null>(null); // string — id школы
  const [error, setError] = useState<unknown>(null);
  const name = (x: { name_kk: string; name_ru: string }) => (lang === "kk" ? x.name_kk || x.name_ru : x.name_ru || x.name_kk);

  const loadRegions = useCallback(() => api.regions().then(setRegions, setError), [api]);
  useEffect(() => { loadRegions(); }, [loadRegions]);

  const top = regions.filter((r) => !r.parent_id);
  const places = regions.filter((r) => r.parent_id === topId);
  const place = regions.find((r) => r.id === placeId) ?? null;
  const target = placeId || topId; // куда добавляются школы

  const loadSchools = useCallback(() => {
    if (!target) { setSchools(null); return; }
    api.schools(target).then(setSchools, setError);
  }, [api, target]);
  useEffect(() => { loadSchools(); }, [loadSchools]);

  async function run(fn: () => Promise<unknown>, after: () => unknown) {
    setError(null);
    try {
      await fn();
      setEditing(null);
      await after();
    } catch (e) { setError(e); }
  }

  const removePlace = (r: RegionRow) => confirm(s.confirmDel(name(r))) &&
    run(() => api.deleteRegion(r.id), () => { setPlaceId(""); return loadRegions(); });
  const removeSchool = (x: SchoolRow) => confirm(s.confirmDel(name(x))) && run(() => api.deleteSchool(x.id), loadSchools);

  return (
    <div className="adm-cols">
      <aside className="adm-side">
        <label className="label" htmlFor="adm-region">{s.region}</label>
        <select id="adm-region" value={topId} onChange={(e) => { setTopId(e.target.value); setPlaceId(""); setEditing(null); }}>
          <option value="">{s.pickRegion}</option>
          {top.map((r) => <option key={r.id} value={r.id}>{name(r)}</option>)}
        </select>

        {topId && (
          <>
            <div className="adm-head">
              <span className="label">{s.places}</span>
              <button type="button" className="link" onClick={() => setEditing("place-new")}>{s.addPlace}</button>
            </div>
            {editing === "place-new" && (
              <NameForm onCancel={() => setEditing(null)} onSave={(n) => run(() => api.saveRegion(
                { parent_id: topId, sort_order: 0, ...n }), loadRegions)} both />
            )}
            <ol className="adm-topics">
              <li>
                <button type="button" aria-pressed={!placeId} onClick={() => { setPlaceId(""); setEditing(null); }}>
                  {s.wholeRegion}
                </button>
              </li>
              {places.map((r) => (
                <li key={r.id}>
                  <button type="button" aria-pressed={r.id === placeId} onClick={() => { setPlaceId(r.id); setEditing(null); }}>
                    {name(r)}
                  </button>
                  {r.id === placeId && (
                    <div className="adm-row">
                      <button type="button" className="link" onClick={() => setEditing("place")}>{t.browse.rename}</button>
                      <button type="button" className="link danger" onClick={() => removePlace(r)}>{t.del}</button>
                    </div>
                  )}
                  {r.id === placeId && editing === "place" && (
                    <NameForm row={r} onCancel={() => setEditing(null)} both
                      onSave={(n) => run(() => api.saveRegion({ ...r, ...n }), loadRegions)} />
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </aside>

      <section className="adm-main">
        <div className="adm-head">
          <h2>{place ? name(place) : top.find((r) => r.id === topId) ? name(top.find((r) => r.id === topId)!) : s.title}</h2>
          {target && <button type="button" className="btn sm" onClick={() => setEditing("school-new")}>{s.addSchool}</button>}
        </div>
        {!target && <p className="lede">{s.lede}</p>}
        {error !== null && (
          <p className="error" role="alert">{humanError(error, t)}{" "}
            <button type="button" className="link" onClick={() => setError(null)}>×</button></p>
        )}
        {editing === "school-new" && (
          <NameForm onCancel={() => setEditing(null)}
            onSave={(n) => run(() => api.saveSchool({ region_id: target, approved: true, ...n }), loadSchools)} />
        )}
        {schools && schools.length === 0 && <p className="muted">{s.noSchools}</p>}
        {schools && schools.length > 0 && (
          <ol className="adm-qs">
            {schools.map((x) => (
              <li key={x.id} className="adm-school">
                <span className="qt">{name(x)}</span>
                <span className="meta">
                  {!x.approved && <span className="st review">{s.notApproved}</span>}
                  {!x.approved && (
                    <button type="button" className="link" onClick={() => run(() => api.saveSchool({ ...x, approved: true }), loadSchools)}>
                      {s.approve}
                    </button>
                  )}
                  <button type="button" className="link" onClick={() => setEditing(x.id)}>{t.browse.rename}</button>
                  <button type="button" className="link danger" onClick={() => removeSchool(x)}>{t.del}</button>
                </span>
                {editing === x.id && (
                  <NameForm row={x} onCancel={() => setEditing(null)}
                    onSave={(n) => run(() => api.saveSchool({ ...x, ...n }), loadSchools)} />
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/** Название на казахском и русском. both — нужны оба (у районов); иначе хватит одного (у школ). */
function NameForm({ row, both, onSave, onCancel }: {
  row?: { name_kk: string; name_ru: string };
  both?: boolean;
  onSave: (n: { name_kk: string; name_ru: string }) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [kk, setKk] = useState(row?.name_kk ?? "");
  const [ru, setRu] = useState(row?.name_ru ?? "");
  const [error, setError] = useState("");

  function save(e: React.FormEvent) {
    e.preventDefault();
    const n = { name_kk: kk.trim(), name_ru: ru.trim() };
    if (both ? !n.name_kk || !n.name_ru : !n.name_kk && !n.name_ru) { setError(both ? t.schools.needBoth : t.topicForm.needTitle); return; }
    onSave(n);
  }

  return (
    <form className="adm-mini" onSubmit={save}>
      <label>{t.topicForm.title("KK")}<input value={kk} autoFocus onChange={(e) => setKk(e.target.value)} /></label>
      <label>{t.topicForm.title("RU")}<input value={ru} onChange={(e) => setRu(e.target.value)} /></label>
      {error && <p className="error">{error}</p>}
      <div className="adm-row">
        <button type="submit" className="btn sm">{t.save}</button>
        <button type="button" className="btn ghost sm" onClick={onCancel}>{t.cancel}</button>
      </div>
    </form>
  );
}
