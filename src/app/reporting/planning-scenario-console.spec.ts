import { describe, expect, it } from 'vitest';
import { nextPlanningScenarioStatus } from './planning-scenario-console';

describe('planning scenario actions', () => {
  it('exposes only the next legal workflow transition', () => {
    expect(nextPlanningScenarioStatus('DRAFT')).toBe('SUBMITTED');
    expect(nextPlanningScenarioStatus('SUBMITTED')).toBe('VALIDATED');
    expect(nextPlanningScenarioStatus('VALIDATED')).toBe('OFFICIAL_BUDGET');
    expect(nextPlanningScenarioStatus('OFFICIAL_BUDGET')).toBeUndefined();
    expect(nextPlanningScenarioStatus('UNKNOWN')).toBeUndefined();
  });
});
