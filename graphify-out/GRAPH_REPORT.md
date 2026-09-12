# Graph Report - pms-frontend  (2026-09-09)

## Corpus Check
- 130 files · ~48,405 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 679 nodes · 1255 edges · 43 communities (32 shown, 11 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1be889e2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- application-shell.tsx
- product-api.ts
- [...path]/route.ts
- scripts
- options.ts
- compilerOptions
- calculations/page.tsx
- sharia/page.tsx
- manifest.json
- real-bff-integration.mjs
- health/route.ts
- web-runtime-smoke.mjs
- verify-runtime.mjs
- SOURCE.md
- pipeline.md
- index.d.ts
- next.config.js
- next-env.d.ts
- README.md
- vendor/README.md
- verify-sdk-provenance.mjs
- verify-extraction-readiness.mjs
- allocation-api.ts
- risk/page.tsx
- closing-api.ts
- reconciliation-api.ts
- audit-api.ts
- reporting-api.ts
- CustomerConsole
- subscriptions/page.tsx
- revenue-api.ts
- purification-console.tsx
- quotation-console.tsx
- opening-balance-console.tsx
- token-api.ts
- compliance-console.tsx
- verify-bff-operation-coverage.mjs
- verify-page-access-coverage.mjs
- forbidden/page.tsx
- exception-console.tsx

## God Nodes (most connected - your core abstractions)
1. `POST()` - 60 edges
2. `authOptions` - 22 edges
3. `isDecimal()` - 17 edges
4. `compilerOptions` - 16 edges
5. `scripts` - 14 edges
6. `ApplicationShell()` - 11 edges
7. `poolRequest()` - 10 edges
8. `GET()` - 10 edges
9. `AllocationsConsole()` - 9 edges
10. `CustomerConsole()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `authenticatedClient()` --calls--> `sessionCookieName()`  [EXTRACTED]
  src/app/api/core/[...path]/route.ts → src/auth/options.ts
- `ApplicationShell()` --calls--> `canAccessNavigationRoute()`  [EXTRACTED]
  src/app/application-shell.tsx → src/auth/navigation-access.ts
- `changeLocale()` --calls--> `localeCookie()`  [EXTRACTED]
  src/app/application-shell.tsx → src/i18n/config.ts
- `submit()` --indirect_call--> `command()`  [INFERRED]
  src/app/audit/document-archive-console.tsx → src/app/audit/audit-api.ts
- `refresh()` --calls--> `getDocumentArchiveRequest()`  [EXTRACTED]
  src/app/audit/document-archive-console.tsx → src/app/audit/audit-api.ts

## Import Cycles
- None detected.

## Communities (43 total, 11 thin omitted)

### Community 0 - "application-shell.tsx"
Cohesion: 0.10
Nodes (29): ApplicationShell(), changeLocale(), heights, Props, audienceByRole, audienceForRoles(), dashboardItemLabel(), dashboardItemValue() (+21 more)

### Community 1 - "product-api.ts"
Cohesion: 0.14
Nodes (23): ApiProblem, ComplianceReferenceSource, CreateProductReferenceCommand, isExactNisba(), ProductReference, ProductReferenceKind, productReferencesRequest(), productRequest() (+15 more)

### Community 2 - "[...path]/route.ts"
Cohesion: 0.07
Nodes (70): apiError(), authenticatedClient(), correlatedJson(), correlationId(), GET(), hasTokenPurpose(), isAccountingAcknowledgementCommand(), isAccountingEventCommand() (+62 more)

### Community 3 - "scripts"
Cohesion: 0.05
Nodes (40): @bank/pms-api-client, next-auth, dependencies, @bank/pms-api-client, next, next-auth, react, react-dom (+32 more)

### Community 4 - "options.ts"
Cohesion: 0.07
Nodes (31): checkedHandler(), handler, loadCbsQuality(), qualitySummary(), CbsQualityConsole(), stateClass(), dynamic, metadata (+23 more)

### Community 5 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, src/**/*.spec.ts (+20 more)

### Community 7 - "calculations/page.tsx"
Cohesion: 0.20
Nodes (13): calculationRequest(), profitExplanationRequest(), validExplanationIdentifiers(), validJustification(), CalculationsConsole(), execute(), load(), lookup() (+5 more)

### Community 8 - "sharia/page.tsx"
Cohesion: 0.24
Nodes (9): dynamic, metadata, ShariaAction, shariaRequest(), shariaValidationMessage(), Mode, ShariaConsole(), action() (+1 more)

### Community 9 - "manifest.json"
Cohesion: 0.29
Nodes (6): artifactSha256, contractSha256, package, sourceContract, sourceRepository, version

### Community 10 - "real-bff-integration.mjs"
Cohesion: 0.50
Nodes (4): obtainAccessToken(), required(), secret, webUrl

### Community 24 - "verify-sdk-provenance.mjs"
Cohesion: 0.25
Nodes (6): backendPackage, backendRoot, checks, failures, frontendRoot, manifest

### Community 25 - "verify-extraction-readiness.mjs"
Cohesion: 0.33
Nodes (6): backendRoot, failures, frontendRoot, isRuntimeFile(), runtimeFiles(), visit()

### Community 26 - "allocation-api.ts"
Cohesion: 0.16
Nodes (21): anomalyCommand(), getAllocationHistory(), getAssetAnomalies(), getPoolComposition(), poolRequest(), reportAssetAnomaly(), resolveAssetAnomaly(), transitionPool() (+13 more)

### Community 27 - "risk/page.tsx"
Cohesion: 0.17
Nodes (17): dynamic, metadata, PublishedRiskDashboardConsole(), submit(), calculateDcr(), getPublishedRiskDashboard(), runStress(), valid (+9 more)

### Community 28 - "closing-api.ts"
Cohesion: 0.31
Nodes (9): approveClosing(), decideClosing(), rejectClosing(), validClosingId(), validClosingJustification(), ClosingConsole(), submit(), dynamic (+1 more)

### Community 29 - "reconciliation-api.ts"
Cohesion: 0.18
Nodes (17): AccountingEventConsole(), emit(), updateAck(), initial, dynamic, metadata, accountingRequest(), acknowledgeAccountingEvent() (+9 more)

### Community 30 - "audit-api.ts"
Cohesion: 0.12
Nodes (24): approveExport(), archiveResponse(), command(), createExport(), generateExport(), getAuditTrail(), getDocumentArchiveRequest(), requestDocumentArchive() (+16 more)

### Community 31 - "reporting-api.ts"
Cohesion: 0.15
Nodes (25): HistoricalForecastConsole(), generate(), dynamic, metadata, PlanningScenarioConsole(), advance(), create(), createPlanningScenario() (+17 more)

### Community 32 - "CustomerConsole"
Cohesion: 0.27
Nodes (10): createCustomer(), getCustomer(), liftCustomerRestriction(), request(), restrictCustomer(), CustomerConsole(), lookup(), run() (+2 more)

### Community 33 - "subscriptions/page.tsx"
Cohesion: 0.29
Nodes (6): dynamic, metadata, createSubscription(), post(), transitionSubscription(), SubscriptionConsole()

### Community 34 - "revenue-api.ts"
Cohesion: 0.18
Nodes (20): dynamic, metadata, adjustIncome(), ChargeEvaluation, configureChargePolicy(), evaluateCharges(), importCharge(), importIncome() (+12 more)

### Community 35 - "purification-console.tsx"
Cohesion: 0.23
Nodes (15): dynamic, metadata, documentCase(), getStatement(), identifyCase(), payCase(), request(), validCase() (+7 more)

### Community 36 - "quotation-console.tsx"
Cohesion: 0.23
Nodes (9): dynamic, metadata, QuotationResult, solveQuotation(), validQuotation(), BasisType, labels, QuotationConsole() (+1 more)

### Community 37 - "opening-balance-console.tsx"
Cohesion: 0.21
Nodes (10): certify(), components, OpeningBalanceLine, validCertification(), initial(), labels, OpeningBalanceConsole(), submit() (+2 more)

### Community 38 - "token-api.ts"
Cohesion: 0.25
Nodes (14): dynamic, metadata, command(), detokenize(), rotateToken(), searchToken(), tokenize(), tokenizeBatch() (+6 more)

### Community 39 - "compliance-console.tsx"
Cohesion: 0.24
Nodes (13): arbitrate(), createReference(), getRule(), request(), validArbitration(), validReference(), ComplianceConsole(), create() (+5 more)

### Community 40 - "verify-bff-operation-coverage.mjs"
Cohesion: 0.25
Nodes (7): auditRouteContract, expected, exposed, missing, missingAuditRouteContract, routeUrl, unknown

### Community 41 - "verify-page-access-coverage.mjs"
Cohesion: 0.33
Nodes (5): app, managedRoutes, pages, publicRoutes, unclassified

### Community 43 - "exception-console.tsx"
Cohesion: 0.24
Nodes (12): command(), createException(), transitionException(), validException(), validTransition(), ExceptionConsole(), detect(), run() (+4 more)

## Knowledge Gaps
- **174 isolated node(s):** `failures`, `sdkManifest`, `*.svg`, `nextConfig`, `name` (+169 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `authOptions` connect `options.ts` to `CustomerConsole`, `application-shell.tsx`, `revenue-api.ts`, `purification-console.tsx`, `quotation-console.tsx`, `opening-balance-console.tsx`, `token-api.ts`, `compliance-console.tsx`, `calculations/page.tsx`, `sharia/page.tsx`, `subscriptions/page.tsx`, `exception-console.tsx`, `allocation-api.ts`, `risk/page.tsx`, `closing-api.ts`, `reconciliation-api.ts`, `audit-api.ts`, `reporting-api.ts`?**
  _High betweenness centrality (0.196) - this node is a cross-community bridge._
- **Why does `ProductsConsole()` connect `product-api.ts` to `options.ts`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **What connects `failures`, `sdkManifest`, `*.svg` to the rest of the system?**
  _174 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `application-shell.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1024390243902439 - nodes in this community are weakly interconnected._
- **Should `product-api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `[...path]/route.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06881287726358148 - nodes in this community are weakly interconnected._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.04878048780487805 - nodes in this community are weakly interconnected._