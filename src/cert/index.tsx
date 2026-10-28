// Страница /cert/id — сертификат автора (DECISIONS.md №103): проверка для всех и печать в PDF.
// Отдельный файл сборки, без supabase-js: один запрос к функции базы certificate.
import { useEffect, useState } from "react";
import { LogoMark } from "../components/NickMenu";
import { CERT } from "../i18n/cert";
import { loadPrefs, savePrefs } from "../lib/storage";
import { tx } from "../lib/text";
import { LANGS } from "../lib/types";
import "./cert.css";

interface Cert {
  number: number;
  full_name: string;
  school: string;
  questions: number;
  milestone: number;
  subjects: { name_kk: string; name_ru: string; name_en: string; grades: number[] }[];
  issued_at: string;
}

export async function loadCert(id: string, fetchFn: typeof fetch = fetch): Promise<Cert | null> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!url || !key || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const res = await fetchFn(`${url}/rest/v1/rpc/certificate`, {
    method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: JSON.stringify({ p_id: id }),
  });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as Cert | null;
}

export default function CertPage({ load = loadCert }: { load?: typeof loadCert }) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const t = CERT[prefs.lang];
  const id = location.pathname.split("/")[2] ?? "";
  const [cert, setCert] = useState<Cert | null | undefined>(undefined); // undefined — загружается
  const [failed, setFailed] = useState(false);

  useEffect(() => { load(id).then(setCert, () => setFailed(true)); }, [id, load]);
  useEffect(() => {
    document.title = cert ? `${t.title} · ${cert.full_name}` : `Білімтест · ${t.title}`;
    document.documentElement.lang = prefs.lang;
  }, [t, prefs.lang, cert]);

  const date = cert ? new Date(cert.issued_at).toLocaleDateString(prefs.lang === "en" ? "en-GB" : prefs.lang === "ru" ? "ru-RU" : "kk-KZ") : "";
  const no = cert ? `BT-${new Date(cert.issued_at).getFullYear()}-${String(cert.number).padStart(5, "0")}` : "";

  return (
    <>
      <header className="top no-print"><div className="wrap">
        <a className="logo" href="/"><LogoMark />Білімтест</a>
        <div className="langs" role="group" aria-label="Language">
          {LANGS.map((l) => (
            <button key={l} type="button" aria-pressed={l === prefs.lang}
              onClick={() => { const p = { ...prefs, lang: l }; setPrefs(p); savePrefs(p); }}>{l.toUpperCase()}</button>
          ))}
        </div>
      </div></header>
      <main id="main" className="wrap">
        {failed ? <p className="error">{t.failed}</p> : cert === undefined ? <p className="loading">{t.loading}</p> : cert === null ? (
          <p className="error">{t.notFound}</p>
        ) : (
          <>
            <p className="cert-ok no-print">✓ {t.valid(no)}</p>
            <article className="cert">
              <div className="cert-logo"><LogoMark /> Білімтест</div>
              <h1>{t.title}</h1>
              <p className="cert-to">{t.givenTo}</p>
              <p className="cert-name">{cert.full_name}</p>
              {cert.school && <p className="cert-school">{cert.school}</p>}
              <p className="cert-text">{t.text(cert.questions)}</p>
              <ul className="cert-subjects">
                {cert.subjects.map((s) => (
                  <li key={s.name_kk}>{tx({ kk: s.name_kk, ru: s.name_ru, en: s.name_en }, prefs.lang)} — {t.grades(s.grades)}</li>
                ))}
              </ul>
              <div className="cert-foot">
                <span>{t.number}: {no}</span>
                <span>{t.date}: {date}</span>
                <span>{t.check}: {location.host}/cert/{id}</span>
              </div>
            </article>
            <p className="no-print cert-actions">
              <button type="button" className="btn" onClick={() => window.print()}>{t.print}</button>
            </p>
          </>
        )}
      </main>
    </>
  );
}
