// Ник в шапке с выпадающим меню — общий для сайта и админки (одна шапка, №85).
import { useEffect, useRef, useState } from "react";

export interface NickMenuItem {
  label: string;
  href?: string;
  /** Действие вместо перехода по ссылке. */
  onClick?: () => void;
}

export function NickMenu({ name, label, items, logout, onLogout }: {
  name: string;
  /** Подпись кнопки для экранного диктора. */
  label: string;
  items: NickMenuItem[];
  logout: string;
  onLogout: () => void;
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
    <div className="acct" ref={ref}>
      <button type="button" className="acct-btn" aria-haspopup="menu" aria-expanded={open} aria-label={label}
        onClick={() => setOpen(!open)}>
        <span className="acct-name">{name}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
      </button>
      {open && (
        <div className="acct-menu" role="menu">
          {items.map((it) => it.onClick
            ? <button key={it.label} type="button" role="menuitem" onClick={() => { setOpen(false); it.onClick!(); }}>{it.label}</button>
            : <a key={it.href + it.label} role="menuitem" href={it.href}>{it.label}</a>)}
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onLogout(); }}>{logout}</button>
        </div>
      )}
    </div>
  );
}

/** Логотип сайта — голубой квадрат с галочкой (сайт, /login, /privacy, админка). */
export function LogoMark() {
  return (
    <span className="logo-mark">
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path d="M3 9.5l3.6 3.6L15 4.7" fill="none" stroke="var(--accent-ink)" strokeWidth="2.6"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
