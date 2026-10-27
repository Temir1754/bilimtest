// Кнопка «Кіру» в шапке; после входа — ник с меню «Кабинет / Шығу».
// Ник и роль берутся из памяти браузера (lib/account), библиотека входа грузится только при выходе.
import { useEffect, useRef, useState } from "react";
import { AUTH } from "../i18n/auth";
import { cabinetPath, clearAccount, loadAccount } from "../lib/account";
import type { Lang } from "../lib/types";

export function AccountMenu({ lang, loginText }: { lang: Lang; loginText: string }) {
  const t = AUTH[lang].menu;
  const [account, setAccount] = useState(loadAccount);
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

  async function logout() {
    setOpen(false);
    try {
      const { supabase, supabaseConfigured } = await import("../lib/supabase");
      if (supabaseConfigured) await supabase().auth.signOut();
    } finally {
      clearAccount();
      setAccount(null);
    }
  }

  if (!account) {
    return (
      <a className="staff" href="/login" aria-label={loginText}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
          <path d="M10 17l5-5-5-5" />
          <path d="M15 12H3" />
        </svg>
        <span>{loginText}</span>
      </a>
    );
  }
  return (
    <div className="acct" ref={ref}>
      <button type="button" className="acct-btn" aria-haspopup="menu" aria-expanded={open} aria-label={t.label}
        onClick={() => setOpen(!open)}>
        <span className="acct-name">{account.name}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
      </button>
      {open && (
        <div className="acct-menu" role="menu">
          <a role="menuitem" href={cabinetPath(account.role)}>{t.cabinet}</a>
          <button type="button" role="menuitem" onClick={logout}>{t.logout}</button>
        </div>
      )}
    </div>
  );
}
