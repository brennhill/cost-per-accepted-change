// cpac CLI — `calc` and `audit` subcommands.
//
// Design: thin orchestration over calculator.js and audit.js. No external
// arg-parsing dep. Output defaults to human-readable; --json switches to a
// machine-readable form suitable for piping into dashboards or jq.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  costPerAcceptedChange,
  formatCurrency,
  formatShare,
  InvalidCPACInputError,
} from './calculator.js';
import { auditRepo, AuditError } from './audit.js';

const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const HELP = `cpac ${pkg.version} — cost per accepted change

Usage:
  cpac calc   [--<input> <number>]...  [--json]
  cpac audit  --since YYYY-MM-DD --until YYYY-MM-DD
              [--repo owner/name] [--survival 30] [--threshold 500]
              [--modelCost N] [--infraCost N] [--engineeringTime N]
              [--reviewCost N] [--reworkCost N]
              [--json]
  cpac --help | --version

Flags accept both \`--name value\` and \`--name=value\` syntax.

Numerator inputs (for calc and audit-with-costs):
  --modelCost N          LLM / API spend in the window
  --infraCost N          Infrastructure spend in the window
  --engineeringTime N    Spec / prompt / integrate cost (currency)
  --reviewCost N         Review / gating cost (currency)
  --reworkCost N         Rework cost for changes that didn't stay (currency)
  --acceptedChanges N    Denominator (calc only — audit computes this)

Audit options:
  --repo owner/name      GitHub repository (else: current git remote)
  --since YYYY-MM-DD     Window start (inclusive, merged-at)
  --until YYYY-MM-DD     Window end (inclusive, merged-at)
  --survival N           Stayed-there window in days (default 30)
  --threshold N          LOC normalization threshold (default 500)

Examples:
  cpac calc --modelCost 1200 --infraCost 400 --engineeringTime 18000 \\
            --reviewCost 6000 --reworkCost 2400 --acceptedChanges 42

  cpac audit --repo brennhill/cost-per-accepted-change \\
             --since 2026-04-01 --until 2026-04-30 --json

Docs: https://costperacceptedchange.org
`;

const BOOLEAN_FLAGS = new Set(['json', 'help', 'version']);
const KNOWN_FLAGS = {
  calc: new Set([
    'modelCost', 'infraCost', 'engineeringTime', 'reviewCost',
    'reworkCost', 'acceptedChanges', 'json',
  ]),
  audit: new Set([
    'since', 'until', 'repo', 'survival', 'threshold',
    'modelCost', 'infraCost', 'engineeringTime', 'reviewCost', 'reworkCost',
    'json',
  ]),
};

function die(msg, code = 1) {
  process.stderr.write(`cpac: ${msg}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const positionals = [];
  const flags = new Map();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      let name;
      let inlineValue;
      if (eq >= 0) {
        name = a.slice(2, eq);
        inlineValue = a.slice(eq + 1);
      } else {
        name = a.slice(2);
        inlineValue = undefined;
      }
      if (!name) die(`bare "--" is not a valid flag`);
      if (BOOLEAN_FLAGS.has(name)) {
        if (inlineValue !== undefined && inlineValue !== '' && inlineValue !== 'true') {
          die(`flag --${name} does not take a value (got "${inlineValue}")`);
        }
        flags.set(name, true);
      } else if (inlineValue !== undefined) {
        flags.set(name, inlineValue);
      } else {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) {
          die(`flag --${name} requires a value`);
        }
        flags.set(name, next);
        i++;
      }
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

function validateFlags(subcommand, flags) {
  const known = KNOWN_FLAGS[subcommand];
  if (!known) return;
  const unknown = [];
  for (const name of flags.keys()) {
    if (!known.has(name)) unknown.push(name);
  }
  if (unknown.length) {
    die(`unknown flag(s) for "${subcommand}": ${unknown.map((n) => '--' + n).join(', ')}. Try: cpac --help`);
  }
}

function num(flags, name, { required = false, integer = false, positive = false } = {}) {
  const raw = flags.get(name);
  if (raw === undefined) {
    if (required) die(`missing required --${name}`);
    return undefined;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) die(`--${name} must be a number; got "${raw}"`);
  if (integer && !Number.isInteger(n)) die(`--${name} must be an integer; got "${raw}"`);
  if (positive && !(n > 0)) die(`--${name} must be positive; got ${n}`);
  return n;
}

function str(flags, name, { required = false } = {}) {
  const v = flags.get(name);
  if (required && v === undefined) die(`missing required --${name}`);
  return v;
}

function runCalc(flags) {
  validateFlags('calc', flags);
  const inputs = {
    modelCost: num(flags, 'modelCost', { required: true }),
    infraCost: num(flags, 'infraCost', { required: true }),
    engineeringTime: num(flags, 'engineeringTime', { required: true }),
    reviewCost: num(flags, 'reviewCost', { required: true }),
    reworkCost: num(flags, 'reworkCost', { required: true }),
    acceptedChanges: num(flags, 'acceptedChanges', { required: true, integer: true }),
  };
  let result;
  try {
    result = costPerAcceptedChange(inputs);
  } catch (err) {
    if (err instanceof InvalidCPACInputError) die(err.message);
    throw err;
  }
  if (flags.get('json')) {
    process.stdout.write(JSON.stringify({ inputs, result }, null, 2) + '\n');
    return;
  }
  process.stdout.write(
    `Cost per accepted change: ${formatCurrency(result.value)}\n` +
      `  Total cost: ${formatCurrency(result.totalCost)}\n` +
      `  Accepted change units: ${result.acceptedChanges}\n` +
      `  Component shares:\n` +
      `    model    ${formatShare(result.breakdown.modelCost).padStart(7)}\n` +
      `    infra    ${formatShare(result.breakdown.infraCost).padStart(7)}\n` +
      `    eng      ${formatShare(result.breakdown.engineeringTime).padStart(7)}\n` +
      `    review   ${formatShare(result.breakdown.reviewCost).padStart(7)}\n` +
      `    rework   ${formatShare(result.breakdown.reworkCost).padStart(7)}\n`,
  );
}

async function runAudit(flags) {
  validateFlags('audit', flags);
  const since = str(flags, 'since', { required: true });
  const until = str(flags, 'until', { required: true });
  const repo = str(flags, 'repo');
  const survivalWindowDays = num(flags, 'survival', { integer: true, positive: true }) ?? 30;
  // threshold is positive but not necessarily integer (matches calculator.js
  // which accepts any positive number).
  const threshold = num(flags, 'threshold', { positive: true }) ?? 500;

  let report;
  try {
    report = await auditRepo({ repo, since, until, survivalWindowDays, threshold });
  } catch (err) {
    if (err instanceof AuditError) die(err.message);
    throw err;
  }

  // Optional cost components → compute full CPAC alongside the audit.
  const hasAnyCost = [
    'modelCost',
    'infraCost',
    'engineeringTime',
    'reviewCost',
    'reworkCost',
  ].some((k) => flags.has(k));
  let cpac = null;
  let cpacError = null;
  if (hasAnyCost) {
    if (report.counts.acceptedChangeUnits === 0) {
      cpacError = 'audit found 0 accepted change units in the window — cannot compute CPAC';
    } else {
      const inputs = {
        modelCost: num(flags, 'modelCost') ?? 0,
        infraCost: num(flags, 'infraCost') ?? 0,
        engineeringTime: num(flags, 'engineeringTime') ?? 0,
        reviewCost: num(flags, 'reviewCost') ?? 0,
        reworkCost: num(flags, 'reworkCost') ?? 0,
        acceptedChanges: report.counts.acceptedChangeUnits,
      };
      cpac = { inputs, result: costPerAcceptedChange(inputs) };
    }
  }

  if (flags.get('json')) {
    // Always emit the audit payload — never swallow it on the zero-units
    // path. cpac is null when uncomputable; the consumer can check.
    process.stdout.write(
      JSON.stringify({ audit: report, cpac, error: cpacError }, null, 2) + '\n',
    );
    return;
  }

  const repoLabel = report.repo ?? '(current repo)';
  const lines = [
    `Audit ${repoLabel}  ${since}..${until}  survival=${survivalWindowDays}d  threshold=${threshold}LOC`,
    ``,
    `  Merged PRs:                  ${report.counts.mergedPRs}`,
    `  Confirmed survived PRs:      ${report.counts.confirmedSurvivedPRs}`,
    `  Provisional survived PRs:    ${report.counts.provisionalSurvivedPRs}`,
    `  Invalidated PRs:             ${report.counts.invalidatedPRs}`,
    `  Accepted change units:       ${report.counts.acceptedChangeUnits} (confirmed only)`,
  ];
  if (report.counts.provisionalChangeUnits > 0) {
    lines.push(
      `  Provisional change units:    ${report.counts.provisionalChangeUnits} (NOT in denominator)`,
    );
  }
  if (report.warnings.length) {
    lines.push('');
    for (const w of report.warnings) lines.push(`  ! ${w}`);
  }
  if (report.repairCandidates.length) {
    lines.push('');
    lines.push(`  Heuristic repair candidates (review manually):`);
    for (const c of report.repairCandidates.slice(0, 10)) {
      lines.push(
        `    #${c.repairPR} "${c.repairTitle}" → maybe-repairs #${c.originalPR} (${c.overlapFiles} file overlap, ${c.ageDays}d after)`,
      );
    }
    if (report.repairCandidates.length > 10) {
      lines.push(`    ... and ${report.repairCandidates.length - 10} more (use --json for the full list)`);
    }
  }
  if (cpac) {
    lines.push('');
    lines.push(`  Cost per accepted change: ${formatCurrency(cpac.result.value)}`);
    lines.push(`    Total cost: ${formatCurrency(cpac.result.totalCost)}`);
    lines.push(`    Denominator: ${cpac.result.acceptedChanges} accepted change units`);
  } else if (cpacError) {
    lines.push('');
    lines.push(`  ! ${cpacError}`);
  } else {
    lines.push('');
    lines.push(`  Pass --modelCost / --infraCost / ... to compute the full CPAC.`);
  }
  process.stdout.write(lines.join('\n') + '\n');
}

export async function main(argv) {
  const { positionals, flags } = parseArgs(argv);
  if (flags.get('version')) {
    process.stdout.write(`${pkg.version}\n`);
    return 0;
  }
  if (flags.get('help') || positionals[0] === 'help' || positionals.length === 0) {
    process.stdout.write(HELP);
    return 0;
  }
  const cmd = positionals[0];
  if (cmd === 'calc') return runCalc(flags);
  if (cmd === 'audit') return await runAudit(flags);
  die(`unknown subcommand "${cmd}". Try: cpac --help`);
}
