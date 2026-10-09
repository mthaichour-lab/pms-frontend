import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HistoricalForecastConsole } from './historical-forecast-console';
import { PlanningScenarioConsole } from './planning-scenario-console';
import { ReportingConsole } from './reporting-console';
import { TenorCurveConsole } from './tenor-curve-console';
import { SubscriberYieldConsole } from './subscriber-yield-console';
import { RevenueYieldConsole } from './revenue-yield-console';

describe('reporting form accessibility', () => {
  it('describes regulatory report and publication constraints', () => {
    const html = renderToStaticMarkup(createElement(ReportingConsole));
    expect(html).toContain('aria-describedby="report-type-hint"');
    expect(html).toContain('aria-describedby="report-evidence-hint"');
    expect(html).toContain('minLength="10"');
    expect(html).toContain('maxLength="1000"');
    expect(html).toContain('<fieldset');
    expect(html).toContain('aria-busy="false"');
  });

  it('describes planning, forecast and tokenized curve fields', () => {
    const planning = renderToStaticMarkup(createElement(PlanningScenarioConsole));
    const forecast = renderToStaticMarkup(createElement(HistoricalForecastConsole));
    const curve = renderToStaticMarkup(createElement(TenorCurveConsole));
    expect(planning).toContain('aria-describedby="planning-decimal-hint"');
    expect(planning).toContain('inputMode="decimal"');
    expect(forecast).toContain('aria-describedby="historical-pool-hint"');
    expect(curve).toContain('aria-describedby="tenor-token-hint"');
    expect(curve).toContain('jamais un identifiant client en clair');
  });

  it('describes the subscriber and revenue yield-by-maturity reports', () => {
    const subscriberYield = renderToStaticMarkup(createElement(SubscriberYieldConsole));
    const revenueYield = renderToStaticMarkup(createElement(RevenueYieldConsole));
    expect(subscriberYield).toContain('Taux de profit et de rendement par souscripteur');
    expect(subscriberYield).toContain('aria-describedby="subscriber-yield-hint"');
    expect(revenueYield).toContain('Taux de rendement et de profit des revenus par GL et par pool');
    expect(revenueYield).toContain('dernier arrêté certifié du pool');
  });
});
