// Страница /privacy — политика конфиденциальности (черновик, требует проверки юристом).
// Отдельный файл сборки: главная страница не становится тяжелее.
import { useEffect, useState } from "react";
import { PRIVACY } from "../i18n/privacy";
import { loadPrefs, savePrefs } from "../lib/storage";
import { LANGS } from "../lib/types";

export default function PrivacyPage() {
  const [prefs, setPrefs] = useState(loadPrefs);
  const t = PRIVACY[prefs.lang];

  useEffect(() => {
    document.title = `Білімтест · ${t.title}`;
    document.documentElement.lang = prefs.lang;
  }, [t, prefs.lang]);

  return (
    <>
      <header className="top"><div className="wrap">
        <a className="logo" href="/">
          <span className="logo-mark">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M3 9.5l3.6 3.6L15 4.7" fill="none" stroke="var(--accent-ink)" strokeWidth="2.6"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          Білімтест
        </a>
        <div className="langs" role="group" aria-label="Language">
          {LANGS.map((l) => (
            <button key={l} type="button" aria-pressed={l === prefs.lang}
              onClick={() => { const p = { ...prefs, lang: l }; setPrefs(p); savePrefs(p); }}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div></header>
      <main id="main"><div className="wrap privacy">
        <a href="/">{t.back}</a>
        <h1>{t.title}</h1>
        <p className="note">{t.draft}</p>
        <p className="lede">{t.updated}</p>
        {t.sections.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            {s.p.map((p) => <p key={p}>{p}</p>)}
          </section>
        ))}
      </div></main>
    </>
  );
}
