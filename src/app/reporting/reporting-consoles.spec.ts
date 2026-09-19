import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HistoricalForecastConsole } from './historical-forecast-console';
import { PlanningScenarioConsole } from './planning-scenario-console';
import { ReportingConsole } from './reporting-console';
import { TenorCurveConsole } from './tenor-curve-console';

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
});
