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
      const name = a.slice(2);
      if (name === 'json' || name === 'help' || name === 'version') {
        flags.set(name, true);
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

function num(flags, name, { required = false, integer = false } = {}) {
  const raw = flags.get(name);
  if (raw === undefined) {
    if (required) die(`missing required --${name}`);
    return undefined;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) die(`--${name} must be a number; got "${raw}"`);
  if (integer && !Number.isInteger(n)) die(`--${name} must be an integer; got "${raw}"`);
  return n;
}

function str(flags, name, { required = false } = {}) {
  const v = flags.get(name);
  if (required && v === undefined) die(`missing required --${name}`);
  return v;
}

function runCalc(flags) {
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
  const since = str(flags, 'since', { required: true });
  const until = str(flags, 'until', { required: true });
  const repo = str(flags, 'repo');
  const survivalWindowDays = num(flags, 'survival', { integer: true }) ?? 30;
  const threshold = num(flags, 'threshold', { integer: true }) ?? 500;

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
  let cpac;
  if (hasAnyCost) {
    if (report.counts.acceptedChangeUnits === 0) {
      die('audit found 0 accepted change units in the window — cannot compute CPAC');
    }
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

  if (flags.get('json')) {
    process.stdout.write(JSON.stringify({ audit: report, cpac }, null, 2) + '\n');
    return;
  }

  const repoLabel = report.repo ?? '(current repo)';
  const lines = [
    `Audit ${repoLabel}  ${since}..${until}  survival=${survivalWindowDays}d  threshold=${threshold}LOC`,
    ``,
    `  Merged PRs:              ${report.counts.mergedPRs}`,
    `  Survived PRs:            ${report.counts.survivedPRs}`,
    `  Invalidated PRs:         ${report.counts.invalidatedPRs}`,
    `  Accepted change units:   ${report.counts.acceptedChangeUnits}`,
  ];
  if (report.counts.tooRecentToEvaluate > 0) {
    lines.push(`  Too-recent to evaluate:  ${report.counts.tooRecentToEvaluate}`);
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
