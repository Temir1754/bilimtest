// Кнопка «Кіру» в шапке; после входа — ник с меню «Кабинет / Әкімші панелі / Шығу».
// Ник и роль берутся из памяти браузера (lib/account), библиотека входа грузится только при выходе.
import { useState } from "react";
import { NickMenu } from "../components/NickMenu";
import type { UiText } from "../i18n/ui";
import { cabinetPath, clearAccount, loadAccount } from "../lib/account";

export function AccountMenu({ ui }: { ui: UiText }) {
  const t = ui.menu;
  const loginText = ui.login;
  const [account, setAccount] = useState(loadAccount);

  async function logout() {
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
  const items = [{ label: t.cabinet, href: cabinetPath(account.role) }];
  // Админ и учитель — ещё ссылка в админку (№85)
  if (account.role !== "student") items.push({ label: t.admin, href: "/admin" });
  return <NickMenu name={account.name} label={t.label} items={items} logout={t.logout} onLogout={logout} />;
}
