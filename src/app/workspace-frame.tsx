"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { directionFor, localeCookie, supportedLocales } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { canAccessNavigationRoute } from "@/auth/navigation-access";
import { initials } from "./dashboard-data";
import { BrandMark, type IconName, UiIcon } from "./application-shell";
import styles from "./page.module.css";
import shell from "./application-shell.module.css";
import frame from "./workspace-frame.module.css";

type WorkspaceFrameProps = {
  children: ReactNode;
  userName?: string | null;
  roles: readonly string[];
  locale: Locale;
};

type NavigationItem = { label: string; icon: IconName; href: string };

export function WorkspaceFrame({ children, userName, roles, locale }: WorkspaceFrameProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const t = getMessages(locale);
  const displayName = userName || t.userFallback;
  const role = roles[0]?.replaceAll("_", " ") ?? t.userRole;

  const groups = useMemo(() => [
    { label: t.pilotage, items: [
      { label: t.dashboard, icon: "home", href: "/" },
      { label: t.closings, icon: "calendar", href: "/closings" },
      { label: "Soldes d’ouverture", icon: "balance", href: "/opening-balances" },
    ] },
    { label: t.management, items: [
      { label: t.products, icon: "layers", href: "/products" },
      { label: "Clients", icon: "users", href: "/customers" },
      { label: "Souscriptions", icon: "subscription", href: "/subscriptions" },
      { label: t.allocations, icon: "allocation", href: "/allocations" },
      { label: "Revenus", icon: "revenue", href: "/revenues" },
      { label: t.calculations, icon: "calculation", href: "/calculations" },
      { label: "Simulation de taux", icon: "rate", href: "/quotations" },
    ] },
    { label: t.control, items: [
      { label: t.risk, icon: "risk", href: "/risk" },
      { label: t.sharia, icon: "check", href: "/sharia" },
      { label: "Gouvernance conformité", icon: "rules", href: "/compliance" },
      { label: "Purification", icon: "purification", href: "/purifications" },
      { label: t.reconciliation, icon: "reconciliation", href: "/reconciliation" },
      { label: "Exceptions", icon: "exception", href: "/exceptions" },
      { label: "Qualité CBS", icon: "quality", href: "/cbs-quality" },
      { label: "Protection des données", icon: "privacy", href: "/data-protection" },
    ] },
    { label: t.restitution, items: [
      { label: t.reporting, icon: "report", href: "/reporting" },
      { label: t.audit, icon: "audit", href: "/audit" },
    ] },
  ] satisfies readonly { label: string; items: readonly NavigationItem[] }[], [t]);

  const visibleGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(locale);
    return groups.map((group) => ({ ...group, items: group.items
      .filter((item) => item.href === "/" || canAccessNavigationRoute(item.href, roles))
      .filter((item) => !normalizedQuery || item.label.toLocaleLowerCase(locale).includes(normalizedQuery)) }))
      .filter((group) => group.items.length > 0);
  }, [groups, locale, query, roles]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  function changeLocale(value: string) {
    if (!supportedLocales.some((candidate) => candidate === value)) return;
    const nextLocale = value as Locale;
    document.cookie = localeCookie(nextLocale);
    document.documentElement.lang = nextLocale;
    document.documentElement.dir = directionFor(nextLocale);
    window.location.reload();
  }

  if (pathname === "/") return children;

  return <div className={`${styles.shell} ${shell.shell}`} lang={locale} dir={directionFor(locale)}>
    <a className={styles.skip} href="#main-content">{t.skip}</a>
    <aside id="primary-navigation" className={`${styles.sidebar} ${shell.sidebar} ${open ? `${styles.open} ${shell.open}` : ""}`} aria-label={t.navigation}>
      <a className={styles.brand} href="/" aria-label="PMS — Tableau de bord"><span className={styles.mark} aria-hidden><BrandMark /></span><div><strong>PMS</strong><small>Profit Sharing Management</small></div></a>
      <nav className={styles.nav}>
        {visibleGroups.map((group, groupIndex) => <section key={group.label} aria-labelledby={`workspace-navigation-group-${groupIndex}`}>
          <h2 id={`workspace-navigation-group-${groupIndex}`} className={`${styles.group} ${shell.group}`}>{group.label}</h2>
          {group.items.map((item) => <Link key={item.href} className={`${styles.link} ${shell.link} ${pathname === item.href ? styles.active : ""}`} href={item.href} aria-current={pathname === item.href ? "page" : undefined} onClick={() => setOpen(false)}><span className={styles.icon} aria-hidden><UiIcon name={item.icon} /></span><span>{item.label}</span></Link>)}
        </section>)}
        {visibleGroups.length === 0 ? <p className={styles.navEmpty}>Aucun module ne correspond à la recherche.</p> : null}
      </nav>
      <div className={styles.sidebarFooter}><span>Base de test</span><small>PMS v1.2.0</small></div>
    </aside>
    {open ? <button type="button" className={styles.overlay} aria-label={t.closeNav} onClick={() => setOpen(false)} /> : null}
    <div className={`${styles.content} ${shell.content}`}>
      <header className={`${styles.topbar} ${shell.topbar}`}>
        <button className={`${styles.menu} ${shell.menu}`} type="button" aria-label={open ? t.closeNav : t.openNav} aria-controls="primary-navigation" aria-expanded={open} onClick={() => setOpen((current) => !current)}>☰</button>
        <label className={styles.search}><UiIcon name="search" /><span className={styles.srOnly}>Rechercher un module</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un produit, un client, une allocation…" /></label>
        <div className={styles.notificationArea}><button className={styles.iconButton} type="button" aria-label="Notifications" aria-haspopup="dialog" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((current) => !current)}><UiIcon name="bell" /><i aria-hidden /></button>{notificationsOpen ? <div className={styles.notificationMenu} role="dialog" aria-label="Notifications"><strong>Notifications</strong><p>Aucune notification prioritaire.</p><button type="button" onClick={() => setNotificationsOpen(false)}>Fermer</button></div> : null}</div>
        <label className={`${styles.language} ${shell.language}`}><span className={styles.srOnly}>{t.language}</span><select id="application-locale" aria-label={t.language} value={locale} onChange={(event) => changeLocale(event.target.value)}>{supportedLocales.map((code) => <option key={code} value={code}>{getMessages(code).localeName}</option>)}</select></label>
        <span className={`${styles.status} ${shell.status}`}>{t.operational}</span>
        <div className={styles.topProfile}><span className={styles.avatar} aria-hidden>{initials(displayName)}</span><div><strong>{displayName}</strong><small>{role}</small></div></div>
      </header>
      <div className={frame.demoBar} role="status"><span><i aria-hidden />Base de données simulée active</span><b>12 produits</b><b>8 clients</b><b>3 pools</b><b>18 opérations</b></div>
      <div id="main-content" className={frame.routeContent}>{children}</div>
    </div>
  </div>;
}
