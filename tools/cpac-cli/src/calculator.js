// Cost per accepted change — pure reference implementation.
// Kept in sync with src/lib/calculator.ts in the same repo. The canonical
// definition lives at https://costperacceptedchange.org.

export class InvalidCPACInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidCPACInputError';
  }
}

function assertNonNegative(name, value) {
  if (!Number.isFinite(value) || value < 0) {
    throw new InvalidCPACInputError(
      `${name} must be a finite, non-negative number; received ${value}`,
    );
  }
}

export function costPerAcceptedChange(inputs) {
  assertNonNegative('modelCost', inputs.modelCost);
  assertNonNegative('infraCost', inputs.infraCost);
  assertNonNegative('engineeringTime', inputs.engineeringTime);
  assertNonNegative('reviewCost', inputs.reviewCost);
  assertNonNegative('reworkCost', inputs.reworkCost);

  if (!Number.isInteger(inputs.acceptedChanges) || inputs.acceptedChanges <= 0) {
    throw new InvalidCPACInputError(
      `acceptedChanges must be a positive integer; received ${inputs.acceptedChanges}`,
    );
  }

  const totalCost =
    inputs.modelCost +
    inputs.infraCost +
    inputs.engineeringTime +
    inputs.reviewCost +
    inputs.reworkCost;

  const value = totalCost / inputs.acceptedChanges;

  const breakdown = totalCost === 0
    ? { modelCost: 0, infraCost: 0, engineeringTime: 0, reviewCost: 0, reworkCost: 0 }
    : {
        modelCost: inputs.modelCost / totalCost,
        infraCost: inputs.infraCost / totalCost,
        engineeringTime: inputs.engineeringTime / totalCost,
        reviewCost: inputs.reviewCost / totalCost,
        reworkCost: inputs.reworkCost / totalCost,
      };

  return {
    value,
    totalCost,
    acceptedChanges: inputs.acceptedChanges,
    breakdown,
  };
}

export const CHANGE_UNIT_LINES = 500;

export function normalizeChanges(changes, threshold = CHANGE_UNIT_LINES) {
  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new InvalidCPACInputError(
      `threshold must be a positive number; received ${threshold}`,
    );
  }
  let units = 0;
  for (const change of changes) {
    const loc = change.linesChanged;
    if (!Number.isFinite(loc) || loc <= 0) continue;
    units += Math.max(1, Math.ceil(loc / threshold));
  }
  return units;
}

export function formatCurrency(value, currency = 'USD', locale = 'en-US') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatShare(fraction, decimals = 1) {
  return `${(fraction * 100).toFixed(decimals)}%`;
}
