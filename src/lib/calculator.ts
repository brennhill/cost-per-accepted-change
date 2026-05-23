/**
 * Cost per accepted change — pure reference implementation.
 *
 * An accepted change is one that reached production and stayed there.
 * If a change is rolled back or reverted within the measurement window,
 * it is not counted in the denominator; the cost incurred to produce it
 * is counted in the numerator (specifically, as rework cost).
 *
 * Originally defined in The Delivery Gap (Brenn Hill, 2026).
 */

export interface CPACInputs {
  /** Total LLM / API cost incurred to produce the changes in this window. */
  modelCost: number;
  /** Infrastructure cost (compute, storage, observability) attributable to producing changes. */
  infraCost: number;
  /** Engineering time spent specifying, prompting, integrating — converted to currency. */
  engineeringTime: number;
  /** Time spent reviewing AI-generated changes — converted to currency. */
  reviewCost: number;
  /** Cost of reworking, reverting, or repairing changes that did not stay in production. */
  reworkCost: number;
  /** Number of changes that reached production and stayed there during the window. */
  acceptedChanges: number;
}

export interface CPACResult {
  /** The cost per accepted change. */
  value: number;
  /** Sum of the numerator. */
  totalCost: number;
  /** Echo of the denominator. */
  acceptedChanges: number;
  /** Per-component contribution as a fraction of total cost (0–1). */
  breakdown: {
    modelCost: number;
    infraCost: number;
    engineeringTime: number;
    reviewCost: number;
    reworkCost: number;
  };
  /** ISO-8601 timestamp when this calculation was produced. */
  computedAt: string;
}

export class InvalidCPACInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCPACInputError';
  }
}

function assertNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new InvalidCPACInputError(
      `${name} must be a finite, non-negative number; received ${value}`,
    );
  }
}

export function costPerAcceptedChange(inputs: CPACInputs): CPACResult {
  assertNonNegative('modelCost', inputs.modelCost);
  assertNonNegative('infraCost', inputs.infraCost);
  assertNonNegative('engineeringTime', inputs.engineeringTime);
  assertNonNegative('reviewCost', inputs.reviewCost);
  assertNonNegative('reworkCost', inputs.reworkCost);

  if (!Number.isFinite(inputs.acceptedChanges) || inputs.acceptedChanges <= 0) {
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
    computedAt: new Date().toISOString(),
  };
}

/** Format a number as USD currency. Pure presentation helper. */
export function formatCurrency(value: number, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}
