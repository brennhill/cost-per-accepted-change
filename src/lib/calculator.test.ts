import { describe, it, expect } from 'vitest';
import {
  costPerAcceptedChange,
  formatCurrency,
  formatShare,
  normalizeChanges,
  InvalidCPACInputError,
  CHANGE_UNIT_LINES,
} from './calculator';

describe('costPerAcceptedChange', () => {
  const baseline = {
    modelCost: 1200,
    infraCost: 400,
    engineeringTime: 18000,
    reviewCost: 6000,
    reworkCost: 2400,
    acceptedChanges: 42,
  };

  it('computes the canonical worked example to $666.67', () => {
    const result = costPerAcceptedChange(baseline);
    expect(result.totalCost).toBe(28000);
    expect(result.value).toBeCloseTo(666.67, 2);
    expect(result.acceptedChanges).toBe(42);
  });

  it('breakdown shares sum to 1', () => {
    const result = costPerAcceptedChange(baseline);
    const sum =
      result.breakdown.modelCost +
      result.breakdown.infraCost +
      result.breakdown.engineeringTime +
      result.breakdown.reviewCost +
      result.breakdown.reworkCost;
    expect(sum).toBeCloseTo(1, 10);
  });

  it('returns all-zero breakdown when totalCost is zero', () => {
    const result = costPerAcceptedChange({
      modelCost: 0,
      infraCost: 0,
      engineeringTime: 0,
      reviewCost: 0,
      reworkCost: 0,
      acceptedChanges: 5,
    });
    expect(result.totalCost).toBe(0);
    expect(result.value).toBe(0);
    expect(result.breakdown.modelCost).toBe(0);
    expect(result.breakdown.engineeringTime).toBe(0);
  });

  it('throws InvalidCPACInputError on negative cost components', () => {
    expect(() => costPerAcceptedChange({ ...baseline, modelCost: -1 })).toThrow(
      InvalidCPACInputError,
    );
  });

  it('throws on NaN inputs', () => {
    expect(() => costPerAcceptedChange({ ...baseline, infraCost: NaN })).toThrow(
      InvalidCPACInputError,
    );
  });

  it('throws on Infinity inputs', () => {
    expect(() =>
      costPerAcceptedChange({ ...baseline, engineeringTime: Infinity }),
    ).toThrow(InvalidCPACInputError);
  });

  it('throws on zero acceptedChanges', () => {
    expect(() => costPerAcceptedChange({ ...baseline, acceptedChanges: 0 })).toThrow(
      InvalidCPACInputError,
    );
  });

  it('throws on negative acceptedChanges', () => {
    expect(() => costPerAcceptedChange({ ...baseline, acceptedChanges: -3 })).toThrow(
      InvalidCPACInputError,
    );
  });

  it('throws on non-integer acceptedChanges', () => {
    expect(() => costPerAcceptedChange({ ...baseline, acceptedChanges: 41.5 })).toThrow(
      InvalidCPACInputError,
    );
  });

  it('is pure: same inputs produce identical results', () => {
    const a = costPerAcceptedChange(baseline);
    const b = costPerAcceptedChange(baseline);
    expect(a).toEqual(b);
  });
});

describe('normalizeChanges', () => {
  it('counts a small PR as 1 unit', () => {
    expect(normalizeChanges([{ linesChanged: 250 }])).toBe(1);
  });

  it('counts a 500-line PR as 1 unit (boundary)', () => {
    expect(normalizeChanges([{ linesChanged: 500 }])).toBe(1);
  });

  it('counts a 501-line PR as 2 units', () => {
    expect(normalizeChanges([{ linesChanged: 501 }])).toBe(2);
  });

  it('counts an 1800-line PR as 4 units', () => {
    expect(normalizeChanges([{ linesChanged: 1800 }])).toBe(4);
  });

  it('sums normalized units across multiple PRs', () => {
    expect(normalizeChanges([{ linesChanged: 250 }, { linesChanged: 1800 }])).toBe(5);
  });

  it('skips zero and negative line counts', () => {
    expect(
      normalizeChanges([
        { linesChanged: 250 },
        { linesChanged: 0 },
        { linesChanged: -100 },
        { linesChanged: 600 },
      ]),
    ).toBe(3); // 250→1 + 600→2
  });

  it('returns 0 for an empty list', () => {
    expect(normalizeChanges([])).toBe(0);
  });

  it('honors a custom threshold', () => {
    expect(normalizeChanges([{ linesChanged: 250 }], 100)).toBe(3); // ceil(250/100)
  });

  it('throws on invalid threshold', () => {
    expect(() => normalizeChanges([{ linesChanged: 100 }], 0)).toThrow(InvalidCPACInputError);
    expect(() => normalizeChanges([{ linesChanged: 100 }], -10)).toThrow(InvalidCPACInputError);
    expect(() => normalizeChanges([{ linesChanged: 100 }], NaN)).toThrow(InvalidCPACInputError);
  });

  it('uses 500 as the default threshold', () => {
    expect(CHANGE_UNIT_LINES).toBe(500);
  });
});

describe('formatters', () => {
  it('formats currency in USD by default', () => {
    expect(formatCurrency(666.67)).toBe('$666.67');
    expect(formatCurrency(1234567.89)).toBe('$1,234,567.89');
  });

  it('formats a [0,1] share as percent with default 1 decimal', () => {
    expect(formatShare(0.428)).toBe('42.8%');
    expect(formatShare(0.5)).toBe('50.0%');
    expect(formatShare(0)).toBe('0.0%');
    expect(formatShare(1)).toBe('100.0%');
  });

  it('formats share with custom decimals', () => {
    expect(formatShare(0.42857, 2)).toBe('42.86%');
    expect(formatShare(0.5, 0)).toBe('50%');
  });
});
