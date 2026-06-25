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
  /**
   * Per-component contribution as a **fraction** of total cost.
   * Each value is in [0, 1] — multiply by 100 (or use `formatShare`) for percent display.
   * All components are 0 when `totalCost` is 0.
   */
  breakdown: {
    modelCost: number;
    infraCost: number;
    engineeringTime: number;
    reviewCost: number;
    reworkCost: number;
  };
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

/**
 * Cost per accepted action (CPAA) — the runtime sibling of cost per accepted
 * change, for *running* AI agents rather than *producing* software.
 *
 * An accepted action is a consequential agent action/outcome that was accepted
 * and stayed accepted through a survival window — not reverted, overridden by a
 * human, re-run to get a result that stuck, re-opened by the user, or the cause
 * of an incident requiring remediation. Actions that did not stay are excluded
 * from the denominator; the cost of cleaning them up is counted in the
 * numerator as remediation cost. (Approval by a human-in-the-loop reviewer is
 * not an override — the test is whether the action *stayed* without correction.)
 */
export interface CPAAInputs {
  /** LLM / inference spend — input/output/cache/reasoning tokens, including retries and multi-step loops. */
  inferenceCost: number;
  /** External tool & API calls the agent makes: search, code execution, RAG/vector, paid third-party APIs. */
  toolCost: number;
  /** Orchestration runtime, sandboxes, memory/vector stores, observability attributable to running the agent. */
  infraCost: number;
  /** Human-in-the-loop oversight labor — approvals, reviews, the Show→Prove load — converted to currency. */
  oversightCost: number;
  /** Cost of remediating actions that did not stay accepted: rollbacks, human redo, incident response. */
  remediationCost: number;
  /** Cost of runs that produced nothing usable but still billed tokens / compute. */
  failedRunCost: number;
  /**
   * Downstream financial *consequence* of actions that failed — distinct from the
   * internal labor to clean them up (that is remediationCost). Captures escalation
   * to costlier channels, lost or delayed revenue, refunds and credits, SLA
   * penalties, churn, and compliance exposure. Often the largest line, and the
   * one most agent dashboards omit; estimate it (failure rate × average
   * consequence) rather than leave it at zero.
   */
  failureImpactCost: number;
  /** Count of agent actions accepted and kept during the window (complexity-normalized, e.g. by risk grade). */
  acceptedActions: number;
}

export interface CPAAResult {
  /** The cost per accepted action. */
  value: number;
  /** Sum of the numerator. */
  totalCost: number;
  /** Echo of the denominator. */
  acceptedActions: number;
  /**
   * Per-component contribution as a **fraction** of total cost (each in [0, 1]).
   * All components are 0 when `totalCost` is 0.
   */
  breakdown: {
    inferenceCost: number;
    toolCost: number;
    infraCost: number;
    oversightCost: number;
    remediationCost: number;
    failedRunCost: number;
    failureImpactCost: number;
  };
}

export function costPerAcceptedAction(inputs: CPAAInputs): CPAAResult {
  assertNonNegative('inferenceCost', inputs.inferenceCost);
  assertNonNegative('toolCost', inputs.toolCost);
  assertNonNegative('infraCost', inputs.infraCost);
  assertNonNegative('oversightCost', inputs.oversightCost);
  assertNonNegative('remediationCost', inputs.remediationCost);
  assertNonNegative('failedRunCost', inputs.failedRunCost);
  assertNonNegative('failureImpactCost', inputs.failureImpactCost);

  if (!Number.isInteger(inputs.acceptedActions) || inputs.acceptedActions <= 0) {
    throw new InvalidCPACInputError(
      `acceptedActions must be a positive integer; received ${inputs.acceptedActions}`,
    );
  }

  const totalCost =
    inputs.inferenceCost +
    inputs.toolCost +
    inputs.infraCost +
    inputs.oversightCost +
    inputs.remediationCost +
    inputs.failedRunCost +
    inputs.failureImpactCost;

  const value = totalCost / inputs.acceptedActions;

  const breakdown = totalCost === 0
    ? {
        inferenceCost: 0,
        toolCost: 0,
        infraCost: 0,
        oversightCost: 0,
        remediationCost: 0,
        failedRunCost: 0,
        failureImpactCost: 0,
      }
    : {
        inferenceCost: inputs.inferenceCost / totalCost,
        toolCost: inputs.toolCost / totalCost,
        infraCost: inputs.infraCost / totalCost,
        oversightCost: inputs.oversightCost / totalCost,
        remediationCost: inputs.remediationCost / totalCost,
        failedRunCost: inputs.failedRunCost / totalCost,
        failureImpactCost: inputs.failureImpactCost / totalCost,
      };

  return {
    value,
    totalCost,
    acceptedActions: inputs.acceptedActions,
    breakdown,
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

/**
 * Format a [0, 1] fraction as a percent string (default 1 decimal place).
 * Pure presentation helper for the `breakdown` fields on CPACResult.
 */
export function formatShare(fraction: number, decimals = 1): string {
  return `${(fraction * 100).toFixed(decimals)}%`;
}

/**
 * A single merged change to be counted toward the denominator.
 * `linesChanged` is additions + deletions, excluding vendored / generated / lockfiles.
 */
export interface ChangeRecord {
  linesChanged: number;
}

/**
 * Default chunking threshold for size-normalization.
 * A merged change of 1–CHANGE_UNIT_LINES lines counts as 1 unit;
 * a larger change of N lines counts as ceil(N / CHANGE_UNIT_LINES) units.
 */
export const CHANGE_UNIT_LINES = 500;

/**
 * Normalize a list of accepted changes into accepted-change units.
 *
 * Each change contributes max(1, ceil(linesChanged / threshold)) units.
 * Non-positive or non-finite line counts are skipped.
 *
 * @example
 *   normalizeChanges([{linesChanged: 250}, {linesChanged: 1800}])
 *   // => 5  (250→1 unit, 1800→4 units)
 */
export function normalizeChanges(
  changes: readonly ChangeRecord[],
  threshold: number = CHANGE_UNIT_LINES,
): number {
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
