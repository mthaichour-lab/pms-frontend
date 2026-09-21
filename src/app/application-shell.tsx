"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AudienceDashboard } from "@bank/pms-api-client";
import type { Locale } from "@/i18n/config";
import { directionFor, localeCookie, supportedLocales } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { canAccessNavigationRoute } from "@/auth/navigation-access";
import { initials } from "./dashboard-data";
import { audienceForRoles, dashboardItemLabel, dashboardItemValue, loadAudienceDashboard } from "./dashboard-api";
import { dashboardChartData, type DashboardChartPeriod } from "./dashboard-chart";
import styles from "./page.module.css";
import shell from "./application-shell.module.css";

type Props = { userName?: string | null; roles: readonly string[]; locale: Locale };
export type IconName = "home" | "calendar" | "balance" | "layers" | "users" | "subscription" | "allocation" | "revenue" | "calculation" | "rate" | "risk" | "check" | "rules" | "purification" | "reconciliation" | "exception" | "quality" | "privacy" | "report" | "audit" | "search" | "bell" | "database" | "trend" | "pie" | "tasks" | "arrow";

const metricShapes = [
  [34, 50, 44, 66, 58, 78, 71], [28, 42, 51, 47, 61, 69, 82],
  [31, 38, 52, 59, 67, 63, 88], [72, 61, 66, 48, 55, 42, 50],
] as const;

export function ApplicationShell({ userName, roles, locale }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dashboard, setDashboard] = useState<AudienceDashboard>();
  const [dashboardState, setDashboardState] = useState<"loading" | "certified" | "demo" | "error">("loading");
  const [chartPeriod, setChartPeriod] = useState<DashboardChartPeriod>('monthly');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const t = getMessages(locale);
  const displayName = userName || t.userFallback;
  const firstName = displayName.split(" ")[0];
  const role = roles[0]?.replaceAll("_", " ") ?? t.userRole;
  const arrow = directionFor(locale) === "rtl" ? "←" : "→";
  const navGroups = [
    { label: t.pilotage, items: [
      { label: t.dashboard, icon: "home" as const, href: "#dashboard" },
      { label: t.closings, icon: "calendar" as const, href: "/closings" },
      { label: "Soldes d’ouverture", icon: "balance" as const, href: "/opening-balances" },
    ] },
    { label: t.management, items: [
      { label: t.products, icon: "layers" as const, href: "/products" },
      { label: "Clients", icon: "users" as const, href: "/customers" },
      { label: "Souscriptions", icon: "subscription" as const, href: "/subscriptions" },
      { label: t.allocations, icon: "allocation" as const, href: "/allocations" },
      { label: "Revenus", icon: "revenue" as const, href: "/revenues" },
      { label: t.calculations, icon: "calculation" as const, href: "/calculations" },
      { label: "Simulation de taux", icon: "rate" as const, href: "/quotations" },
    ] },
    { label: t.control, items: [
      { label: t.risk, icon: "risk" as const, href: "/risk" },
      { label: t.sharia, icon: "check" as const, href: "/sharia" },
      { label: "Gouvernance conformité", icon: "rules" as const, href: "/compliance" },
      { label: "Purification", icon: "purification" as const, href: "/purifications" },
      { label: t.reconciliation, icon: "reconciliation" as const, href: "/reconciliation" },
      { label: "Exceptions", icon: "exception" as const, href: "/exceptions" },
      { label: "Qualité CBS", icon: "quality" as const, href: "/cbs-quality" },
      { label: "Protection des données", icon: "privacy" as const, href: "/data-protection" },
    ] },
    { label: t.restitution, items: [
      { label: t.reporting, icon: "report" as const, href: "/reporting" },
      { label: t.audit, icon: "audit" as const, href: "/audit" },
      { label: "Utilisateurs et rôles", icon: "users" as const, href: "/users" },
    ] },
  ];
  const visibleNavGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(locale);
    return navGroups.map((group) => ({ ...group, items: group.items
      .filter((item) => canAccessNavigationRoute(item.href, roles))
      .filter((item) => !normalizedQuery || item.label.toLocaleLowerCase(locale).includes(normalizedQuery)) }))
      .filter((group) => group.items.length > 0);
  }, [locale, query, roles]);
  const fallbackKpis = [
    { label: t.outstanding, value: "18,42 Md DZD", detail: "+4,8 % sur la période", icon: "database" as const },
    { label: t.distributable, value: "327,6 M DZD", detail: "+4,1 % sur la période", icon: "trend" as const },
    { label: t.portfolioDcr, value: "1,24×", detail: t.threshold, icon: "pie" as const },
    { label: t.actions, value: "7", detail: t.controls, warning: true, icon: "tasks" as const },
  ];
  const displayedKpis = dashboard?.items.slice(0, 4).map((item, index) => ({
    label: dashboardItemLabel(item), value: dashboardItemValue(item), icon: fallbackKpis[index]?.icon ?? "trend" as const,
    detail: item.availability === "AVAILABLE" ? `Indicateur certifié · ${dashboard.audience}` : item.justification ?? "Donnée indisponible documentée",
    warning: item.availability === "UNAVAILABLE",
  })) ?? fallbackKpis;
  const dashboardDetail = dashboardState === "certified" && dashboard
    ? `Situation au ${dashboard.businessDate ?? dashboard.generatedAt.slice(0, 10)} · ${Math.round(dashboard.queryDurationMs)} ms`
    : dashboardState === "demo" ? `${t.consolidatedAt} · mode démonstration`
    : dashboardState === "error" ? "Indicateurs certifiés indisponibles. Vérifiez la connectivité puis réessayez."
    : "Chargement des indicateurs certifiés…";
  const chart = dashboardChartData(chartPeriod);

  useEffect(() => {
    const audience = audienceForRoles(roles);
    if (!audience) { setDashboardState("demo"); return; }
    const controller = new AbortController();
    loadAudienceDashboard(audience, undefined, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setDashboard(result); setDashboardState("certified"); } })
      .catch(() => { if (!controller.signal.aborted) setDashboardState("error"); });
    return () => controller.abort();
  }, [roles]);
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const navigation = document.getElementById("primary-navigation");
    const content = navigation?.parentElement?.lastElementChild;
    content?.setAttribute("inert", "");
    navigation?.querySelector<HTMLAnchorElement>("a")?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("keydown", close); content?.removeAttribute("inert"); trigger?.focus(); };
  }, [open]);
  function changeLocale(value: string) {
    if (!supportedLocales.some((candidate) => candidate === value)) return;
    const nextLocale = value as Locale;
    document.cookie = localeCookie(nextLocale);
    document.documentElement.lang = nextLocale;
    document.documentElement.dir = directionFor(nextLocale);
    window.location.reload();
  }
  function isActive(href: string) { return href === "#dashboard" ? pathname === "/" : pathname === href; }

  return <div className={`${styles.shell} ${shell.shell}`} lang={locale} dir={directionFor(locale)}>
    <a className={styles.skip} href="#main-content">{t.skip}</a>
    <aside id="primary-navigation" className={`${styles.sidebar} ${shell.sidebar} ${open ? `${styles.open} ${shell.open}` : ""}`} aria-label={t.navigation}>
      <div className={styles.brand}><span className={styles.mark} aria-hidden><BrandMark /></span><div><strong>PMS</strong><small>Profit Management System</small></div></div>
      <nav className={styles.nav}>
        {visibleNavGroups.map((group, groupIndex) => <section key={group.label} aria-labelledby={`navigation-group-${groupIndex}`}>
          <h2 id={`navigation-group-${groupIndex}`} className={`${styles.group} ${shell.group}`}>{group.label}</h2>
          {group.items.map((item) => <Link key={item.href} className={`${styles.link} ${shell.link} ${isActive(item.href) ? styles.active : ""}`} href={item.href} scroll={item.href !== "#dashboard"} aria-current={isActive(item.href) ? "page" : undefined} onClick={() => setOpen(false)}><span className={styles.icon} aria-hidden><UiIcon name={item.icon} /></span><span>{item.label}</span></Link>)}
        </section>)}
        {visibleNavGroups.length === 0 ? <p className={styles.navEmpty}>Aucun module ne correspond à la recherche.</p> : null}
      </nav>
      <div className={styles.sidebarFooter}><span>Environnement local</span><small>PMS v1.2.0</small></div>
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
      <main id="main-content" className={styles.main}>
        <section id="dashboard" className={styles.hero} aria-labelledby="dashboard-title">
          <div><p className={styles.eyebrow}>{t.overview}</p><h1 id="dashboard-title">{t.hello}, {firstName}</h1><p>{t.hero}</p></div>
          <div className={styles.heroMeta}><span>{t.month}</span><b>{dashboardState === "certified" ? "Données certifiées" : "Vue de pilotage"}</b></div>
          <div className={styles.flow} aria-label={t.cycle}>{[t.ingestion, t.allocation, t.calculation, t.validation, t.publication].map((step, index) => <span key={step}>{index > 0 ? <i aria-hidden>{arrow}</i> : null}<b>{step}</b></span>)}</div>
        </section>
        <div className={styles.sectionHead}><div><p>Vue d’ensemble</p><h2>{t.keyIndicators}</h2></div><span aria-live="polite" role="status">{dashboardDetail}</span></div>
        <section className={styles.kpis} aria-label={t.keyIndicators}>{displayedKpis.map((kpi, index) => <article className={styles.card} key={kpi.label}><div className={styles.kpiIcon}><UiIcon name={kpi.icon} /></div><div className={styles.kpiCopy}><span className={styles.kpiLabel}>{kpi.label}</span><strong className={styles.kpiValue}>{kpi.value}</strong><span className={`${styles.delta} ${kpi.warning ? styles.warning : ""}`}>{kpi.detail}</span></div><span className={styles.metricSparkline} aria-hidden>{metricShapes[index % metricShapes.length].map((height, barIndex) => <i key={barIndex} style={{ height: `${height}%` }} />)}</span></article>)}</section>
        <section className={styles.dashboardGrid} aria-label={t.operationalTracking}>
          <article className={`${styles.panel} ${styles.performancePanel}`}>
            <div className={styles.cardTitle}><div><p>Analyse consolidée</p><h2>{t.revenueEvolution}</h2></div><div className={styles.segmented} role="group" aria-label="Période du graphique"><button type="button" aria-pressed={chartPeriod === 'monthly'} onClick={() => setChartPeriod('monthly')}>Mensuel</button><button type="button" aria-pressed={chartPeriod === 'annual'} onClick={() => setChartPeriod('annual')}>Annuel</button></div></div>
            <div className={styles.chartValue} aria-live="polite"><strong>{chart.value}</strong><span>{chart.change}</span></div>
            <div className={styles.chartArea}><div className={styles.axis} aria-hidden><span>400 M</span><span>300 M</span><span>200 M</span><span>100 M</span><span>0</span></div><div className={styles.bars} style={{ gridTemplateColumns: `repeat(${chart.points.length}, minmax(1.5rem, 1fr))` }} role="img" aria-label={`${t.chartLabel} · vue ${chartPeriod === 'monthly' ? 'mensuelle' : 'annuelle'}`}>{chart.points.map(({ label, income, distributed }) => <div className={styles.barColumn} key={label}><div className={styles.barItem}><i className={styles.bar} style={{ height: `${income}%` }} /><i className={styles.barAlt} style={{ height: `${distributed}%` }} /></div><span>{label}</span></div>)}</div></div>
            <div className={styles.legend}><span><b />{t.revenues}</span><span><b />{t.distributed}</span></div>
          </article>
          <aside className={`${styles.panel} ${styles.queuePanel}`} aria-labelledby="work-queue-title"><div className={styles.cardTitle}><div><p>Contrôles</p><h2 id="work-queue-title">{t.workQueue}</h2></div>{canAccessNavigationRoute("/exceptions", roles) ? <a href="/exceptions">Voir tout</a> : null}</div><ul className={styles.tasks}>{canAccessNavigationRoute("/calculations", roles) ? <Task title={t.task1} detail={t.task1Detail} value="12" href="/calculations" tone="positive" /> : null}{canAccessNavigationRoute("/reconciliation", roles) ? <Task title={t.task2} detail={t.task2Detail} value="3" href="/reconciliation" tone="negative" /> : null}{canAccessNavigationRoute("/subscriptions", roles) ? <Task title="Souscriptions à valider" detail="Contrats en attente" value="8" href="/subscriptions" /> : null}{canAccessNavigationRoute("/allocations", roles) ? <Task title="Allocations en attente" detail="Capacité à confirmer" value="5" href="/allocations" /> : null}{canAccessNavigationRoute("/reporting", roles) ? <Task title={t.task3} detail={t.task3Detail} value="6" href="/reporting" /> : null}</ul></aside>
        </section>
        <section className={`${styles.panel} ${styles.workflowPanel}`} aria-labelledby="workflow-title"><div className={styles.cardTitle}><div><p>Activité récente</p><h2 id="workflow-title">Derniers workflows PMS</h2></div>{canAccessNavigationRoute("/audit", roles) ? <a href="/audit">Voir la piste d’audit</a> : null}</div><div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>Type</th><th>Objet</th><th>Montant / encours</th><th>Statut</th><th>Assigné</th></tr></thead><tbody><WorkflowRow date="29/08/2026 · 10:24" type="Allocation" reference="TRF-ALLOC-20260829-001" amount="250,0 M DZD" status="En contrôle" owner="N. Benali" /><WorkflowRow date="29/08/2026 · 09:17" type="Souscription" reference="SUB-20260829-1783" amount="12,5 M DZD" status="À valider" owner="S. Moreau" tone="warning" /><WorkflowRow date="28/08/2026 · 16:42" type="Calcul" reference="CALC-20260828-7712" amount="—" status="Terminé" owner="M. Diallo" /><WorkflowRow date="28/08/2026 · 11:06" type="Réconciliation" reference="REC-20260828-4410" amount="18,7 M DZD" status="Écart détecté" owner="A. Bernard" tone="negative" /></tbody></table></div></section>
      </main>
    </div>
  </div>;
}

function Task({ title, detail, value, href, tone = "neutral" }: { title: string; detail: string; value: string; href: string; tone?: "neutral" | "positive" | "negative" }) { return <li className={styles.task}><span className={`${styles.taskMark} ${styles[tone]}`} aria-hidden><UiIcon name="tasks" /></span><div><strong>{title}</strong><small>{detail}</small></div><b>{value}</b><a href={href} aria-label={`Ouvrir ${title}`}><UiIcon name="arrow" /></a></li>; }
function WorkflowRow({ date, type, reference, amount, status, owner, tone = "positive" }: { date: string; type: string; reference: string; amount: string; status: string; owner: string; tone?: "positive" | "warning" | "negative" }) { return <tr><td>{date}</td><td>{type}</td><td>{reference}</td><td>{amount}</td><td><span className={`${styles.workflowStatus} ${styles[tone]}`}><i aria-hidden />{status}</span></td><td>{owner}</td></tr>; }
export function BrandMark() { return <svg viewBox="0 0 32 32" aria-hidden><path d="M5 14 16 5l11 9v13h-7V17h-8v10H5Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"/><path d="M10 11v-4m6 1V3m6 8V7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>; }
export function UiIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></>, calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4m8-4v4M3 10h18"/></>, balance: <><path d="M4 19h16M12 4v15M6 7h12"/><path d="m6 7-3 6h6L6 7Zm12 0-3 6h6l-3-6Z"/></>, layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5m-18 5 9 5 9-5"/></>,
    users: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20v-2c0-3 2.5-5 6-5s6 2 6 5v2m1-6c3 0 5 2 5 5v1"/></>, subscription: <><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8m-8 4h8m-4 3v4m-2-2h4"/></>, allocation: <><circle cx="6" cy="7" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="12" cy="18" r="2"/><path d="M8 7h8m1 2-4 7M7 9l4 7"/></>, revenue: <><path d="M4 19V9m5 10V5m5 14v-7m5 7V3"/><path d="m3 8 5-4 5 5 7-7"/></>,
    calculation: <><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 7h8M8 12h2m4 0h2m-8 4h2m4 0h2"/></>, rate: <><circle cx="7" cy="7" r="3"/><circle cx="17" cy="17" r="3"/><path d="m19 5-14 14"/></>, risk: <><path d="M12 3 3 20h18L12 3Z"/><path d="M12 9v5m0 3v.1"/></>, check: <><path d="M20 11a8 8 0 1 1-3-6"/><path d="m8 11 3 3 9-10"/></>, rules: <><path d="M6 3h12v18H6z"/><path d="M9 8h6m-6 4h6m-6 4h4"/></>,
    purification: <><path d="M12 3s6 6 6 11a6 6 0 0 1-12 0c0-5 6-11 6-11Z"/><path d="M9 15c1 1 2 1.5 4 1"/></>, reconciliation: <><path d="M4 7h14l-3-3m3 3-3 3M20 17H6l3 3m-3-3 3-3"/></>, exception: <><path d="M12 3 3 20h18L12 3Z"/><path d="M12 9v5m0 3v.1"/></>, quality: <><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>, privacy: <><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/></>,
    report: <><path d="M5 3h14v18H5z"/><path d="M9 16v-3m3 3V8m3 8v-5"/></>, audit: <><circle cx="10" cy="10" r="6"/><path d="m14.5 14.5 5 5M8 10l1.5 1.5L12 8"/></>, search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></>, bell: <><path d="M6 17h12l-2-3V9a4 4 0 0 0-8 0v5l-2 3Z"/><path d="M10 20h4"/></>, database: <><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6m-16 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>,
    trend: <><path d="M4 18 10 12l4 3 6-8"/><path d="M15 7h5v5"/></>, pie: <><path d="M12 3v9h9A9 9 0 1 1 12 3Z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15Z"/></>, tasks: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M8 9l1.5 1.5L12 8m2 2h2M8 15l1.5 1.5L12 14m2 2h2"/></>, arrow: <><path d="M5 12h14m-5-5 5 5-5 5"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>;
}
