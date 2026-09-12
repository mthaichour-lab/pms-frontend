import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CalculationError, CalculationStatus } from "./calculation-feedback";

describe("calculation feedback", () => {
  it("renders failures as assertive alerts", () => {
    const html = renderToStaticMarkup(createElement(CalculationError, { message: "Calcul refusé" }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('aria-atomic="true"');
  });

  it("renders successful transitions as polite status messages", () => {
    const html = renderToStaticMarkup(createElement(CalculationStatus, { message: "Run chargé." }));
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });
});
