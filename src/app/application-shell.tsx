"use client";
import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import { directionFor, localeCookie, supportedLocales } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { initials } from "./dashboard-data";
import { audienceForRoles, dashboardItemLabel, dashboardItemValue, loadAudienceDashboard } from "./dashboard-api";
import type { AudienceDashboard } from "@bank/pms-api-client";
import { canAccessNavigationRoute } from "@/auth/navigation-access";
import styles from "./page.module.css";
import shell from "./application-shell.module.css";
type Props = {
  userName?: string | null;
  roles: readonly string[];
  locale: Locale;
};
const heights = [
  [54, 42],
  [64, 51],
  [58, 48],
  [75, 62],
  [82, 69],
  [91, 76],
];
const metricShapes = [
  [34, 62, 48, 74, 56, 82, 67],
  [76, 48, 64, 42, 58, 35, 52],
  [28, 41, 36, 55, 63, 79, 91],
  [42, 58, 39, 72, 51, 68, 60],
];
export function ApplicationShell({ userName, roles, locale }: Props) {
  const [open, setOpen] = useState(false),
    [dashboard, setDashboard] = useState<AudienceDashboard>(),
    [dashboardState, setDashboardState] = useState<"loading" | "certified" | "demo" | "error">("loading"),
    t = getMessages(locale),
    displayName = userName || t.userFallback,
    role = roles[0]?.replaceAll("_", " ") ?? t.userRole,
    arrow = directionFor(locale) === "rtl" ? "←" : "→";
  const navGroups = [
    {
      label: t.pilotage,
      items: [
        { label: t.dashboard, icon: "⌂", href: "#dashboard" },
        { label: t.closings, icon: "◫", href: "/closings" },
        { label: "Soldes d’ouverture", icon: "≍", href: "/opening-balances" },
      ],
    },
    {
      label: t.management,
      items: [
        { label: t.products, icon: "◇", href: "/products" },
        { label: "Clients", icon: "○", href: "/customers" },
        { label: "Souscriptions", icon: "+", href: "/subscriptions" },
        { label: t.allocations, icon: "⇄", href: "/allocations" },
        { label: "Revenus", icon: "¤", href: "/revenues" },
        { label: t.calculations, icon: "∑", href: "/calculations" },
        { label: "Simulation de taux", icon: "%", href: "/quotations" },
      ],
    },
    {
      label: t.control,
      items: [
        { label: t.risk, icon: "△", href: "/risk" },
        { label: t.sharia, icon: "✓", href: "/sharia" },
        { label: "Gouvernance conformité", icon: "§", href: "/compliance" },
        { label: "Purification", icon: "♧", href: "/purifications" },
        { label: t.reconciliation, icon: "≡", href: "/reconciliation" },
        { label: "Exceptions", icon: "!", href: "/exceptions" },
        { label: "Qualité CBS", icon: "◉", href: "/cbs-quality" },
        { label: "Protection des données", icon: "⌾", href: "/data-protection" },
      ],
    },
    {
      label: t.restitution,
      items: [
        { label: t.reporting, icon: "▤", href: "/reporting" },
        { label: t.audit, icon: "◎", href: "/audit" },
      ],
    },
  ];
  const visibleNavGroups = navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => canAccessNavigationRoute(item.href, roles)) }))
    .filter((group) => group.items.length > 0);
  const kpis = [
    {
      label: t.outstanding,
      value: "18,42 Md DZD",
      detail: t.outstandingDetail,
    },
    { label: t.distributable, value: "327,6 M DZD", detail: t.revenuePeriod },
    { label: t.portfolioDcr, value: "1,24×", detail: t.threshold },
    { label: t.actions, value: "7", detail: t.controls, warning: true },
  ];
  const displayedKpis = dashboard?.items.slice(0, 4).map((item) => ({
    label: dashboardItemLabel(item),
    value: dashboardItemValue(item),
    detail: item.availability === "AVAILABLE" ? `Indicateur certifié · ${dashboard.audience}` : item.justification ?? "Donnée indisponible documentée",
    warning: item.availability === "UNAVAILABLE",
  })) ?? kpis;
  const dashboardDetail = dashboardState === "certified" && dashboard
    ? `Situation au ${dashboard.businessDate ?? dashboard.generatedAt.slice(0, 10)} · ${Math.round(dashboard.queryDurationMs)} ms`
    : dashboardState === "demo" ? `${t.consolidatedAt} · mode démonstration` : dashboardState === "error" ? "Indicateurs certifiés indisponibles. Vérifiez la connectivité puis réessayez." : "Chargement des indicateurs certifiés…";
  useEffect(() => {
    const audience = audienceForRoles(roles);
    if (!audience) { setDashboardState("demo"); return; }
    const controller = new AbortController();
    loadAudienceDashboard(audience, undefined, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setDashboard(result); setDashboardState("certified"); } })
      .catch(() => { if (!controller.signal.aborted) setDashboardState("error"); });
    return () => { controller.abort(); };
  }, [roles]);
  useEffect(() => {
    if (!open) return;
    const trigger =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : undefined,
      navigation = document.getElementById("primary-navigation"),
      content = navigation?.parentElement?.lastElementChild;
    content?.setAttribute("inert", "");
    navigation?.querySelector<HTMLAnchorElement>("a")?.focus();
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("keydown", close);
      content?.removeAttribute("inert");
      trigger?.focus();
    };
  }, [open]);
  function changeLocale(value: string) {
    if (!supportedLocales.some((candidate) => candidate === value)) return;
    const nextLocale = value as Locale;
    document.cookie = localeCookie(nextLocale);
    document.documentElement.lang = nextLocale;
    document.documentElement.dir = directionFor(nextLocale);
    window.location.reload();
  }
  return (
    <div className={`${styles.shell} ${shell.shell}`} lang={locale} dir={directionFor(locale)}>
      <a className={styles.skip} href="#main-content">
        {t.skip}
      </a>
      <aside
        id="primary-navigation"
        className={`${styles.sidebar} ${shell.sidebar} ${open ? `${styles.open} ${shell.open}` : ""}`}
        aria-label={t.navigation}
      >
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden>
            P
          </span>
          <div>
            <strong>PMS</strong>
            <small>{t.productName}</small>
          </div>
        </div>
        <nav className={styles.nav}>
          {visibleNavGroups.map((g, groupIndex) => (
            <section key={g.label} aria-labelledby={`navigation-group-${groupIndex}`}>
              <h2 id={`navigation-group-${groupIndex}`} className={`${styles.group} ${shell.group}`}>{g.label}</h2>
              {g.items.map((i) => (
                <a
                  key={i.href}
                  className={`${styles.link} ${shell.link} ${i.href === "#dashboard" ? styles.active : ""}`}
                  href={i.href}
                  aria-current={i.href === "#dashboard" ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <span className={styles.icon} aria-hidden>
                    {i.icon}
                  </span>
                  {i.label}
                </a>
              ))}
            </section>
          ))}
        </nav>
        <div className={styles.profile}>
          <span className={styles.avatar} aria-hidden>
            {initials(displayName)}
          </span>
          <div>
            <span>{displayName}</span>
            <small>{role}</small>
          </div>
        </div>
      </aside>
      {open && (
        <button
          type="button"
          className={styles.overlay}
          aria-label={t.closeNav}
          onClick={() => setOpen(false)}
        />
      )}
      <div className={`${styles.content} ${shell.content}`}>
        <header className={`${styles.topbar} ${shell.topbar}`}>
          <button
            className={`${styles.menu} ${shell.menu}`}
            type="button"
            aria-label={t.openNav}
            aria-controls="primary-navigation"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            ☰
          </button>
          <div className={`${styles.crumb} ${shell.crumb}`}>
            <small>{t.pilotage}</small>
            <strong>{t.dashboard}</strong>
          </div>
          <label className={`${styles.language} ${shell.language}`}>
            {t.language}
            <select
              id="application-locale"
              aria-label={t.language}
              value={locale}
              onChange={(e) => changeLocale(e.target.value)}
            >
              {supportedLocales.map((code) => (
                <option key={code} value={code}>
                  {getMessages(code).localeName}
                </option>
              ))}
            </select>
          </label>
          <span className={styles.period}>
            {t.period} · <b>{t.month}</b>
          </span>
          <span className={`${styles.status} ${shell.status}`}>{t.operational}</span>
        </header>
        <main id="main-content" className={styles.main}>
          <section
            id="dashboard"
            className={styles.hero}
            aria-labelledby="dashboard-title"
          >
            <p className={styles.eyebrow}>{t.overview}</p>
            <h1 id="dashboard-title">
              {t.hello} {displayName.split(" ")[0]}
            </h1>
            <p>{t.hero}</p>
            <div className={styles.flow} aria-label={t.cycle}>
              {[
                t.ingestion,
                t.allocation,
                t.calculation,
                t.validation,
                t.publication,
              ].map((step, index) => (
                <span key={step}>
                  {index > 0 && <i aria-hidden>{arrow}</i>}
                  <b>{step}</b>
                </span>
              ))}
            </div>
          </section>
          <SectionTitle title={t.keyIndicators} detail={dashboardDetail} />
          <section className={styles.kpis} aria-label={t.keyIndicators}>
            {displayedKpis.map((k, metricIndex) => (
              <article className={styles.card} key={k.label}>
                <span className={styles.kpiLabel}>{k.label}</span>
                <strong className={styles.kpiValue}>{k.value}</strong>
                <span
                  className={`${styles.delta} ${k.warning ? styles.warning : ""}`}
                >
                  {k.detail}
                </span>
                <span className={styles.metricSparkline} aria-hidden>
                  {metricShapes[metricIndex % metricShapes.length].map((height, index) => (
                    <i key={index} style={{ height: `${height}%` }} />
                  ))}
                </span>
              </article>
            ))}
          </section>
          <SectionTitle
            title={t.operationalTracking}
            detail={t.trackingDetail}
          />
          <section className={styles.grid} aria-label={t.operationalTracking}>
            <article className={styles.card}>
              <div className={styles.cardTitle}>
                <h3>{t.revenueEvolution}</h3>
                <span className={styles.badge}>{t.upToDate}</span>
              </div>
              <div className={styles.bars} role="img" aria-label={t.chartLabel}>
                {heights.map(([a, b], i) => (
                  <div className={styles.barItem} key={i}>
                    <i className={styles.bar} style={{ height: `${a}%` }} />
                    <i className={styles.barAlt} style={{ height: `${b}%` }} />
                  </div>
                ))}
              </div>
              <div className={styles.legend}>
                <span>
                  <b />
                  {t.revenues}
                </span>
                <span>
                  <b />
                  {t.distributed}
                </span>
              </div>
            </article>
            <article className={styles.card}>
              <div className={styles.cardTitle}>
                <h3>{t.workQueue}</h3>
                <span className={styles.badge}>{t.sevenActions}</span>
              </div>
              <ul className={styles.tasks}>
                <Task title={t.task1} detail={t.task1Detail} time="09:30" />
                <Task title={t.task2} detail={t.task2Detail} time="11:00" />
                <Task title={t.task3} detail={t.task3Detail} time="14:00" />
              </ul>
            </article>
          </section>
        </main>
      </div>
    </div>
  );
}
function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <div className={styles.sectionHead}>
      <h2>{title}</h2>
    <p aria-live="polite" aria-atomic="true" role="status">{detail}</p>
    </div>
  );
}
function Task({
  title,
  detail,
  time,
}: {
  title: string;
  detail: string;
  time: string;
}) {
  return (
    <li className={styles.task}>
      <i className={styles.taskMark} aria-hidden />
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <time>{time}</time>
    </li>
  );
}
