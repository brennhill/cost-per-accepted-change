// Repo audit: pull merged PRs in a window via the gh CLI, detect reverts
// and repair follow-ups, apply the 500-LOC normalization, and emit a
// structured report.
//
// Revert detection is conservative — we only mark a change as "not survived"
// when there's an explicit revert link (PR title "Revert <orig>", body
// "Reverts #N" or "This reverts commit"). Heuristic "likely repair"
// candidates (hotfix-titled PRs touching overlapping files within the
// survival window) are surfaced separately for human review, never
// auto-applied. The site's FAQ defines the judgment call: "if a reasonable
// reviewer would describe the follow-up as 'fixing what the original got
// wrong,' it invalidates."

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { normalizeChanges, CHANGE_UNIT_LINES } from './calculator.js';

const execFileAsync = promisify(execFile);

const GH_PR_LIST_LIMIT = 1000;
const DEFAULT_SURVIVAL_WINDOW_DAYS = 30;

const REPAIR_TITLE_PATTERNS = [
  /^\s*(hot)?fix(up)?[\s(:!]/i,
  /^\s*bugfix[\s(:!]/i,
  /^\s*patch[\s(:!]/i,
];

const REVERT_TITLE_PATTERN = /^\s*revert\b/i;
const REVERTS_HASH_PATTERN = /This reverts commit ([0-9a-f]{7,40})/gi;
const REVERTS_PR_PATTERN = /(?:reverts?|reverting)\s+#(\d+)/gi;

export class AuditError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuditError';
  }
}

async function ghJson(args) {
  try {
    const { stdout } = await execFileAsync('gh', args, {
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new AuditError(
        'gh CLI not found on PATH. Install GitHub CLI: https://cli.github.com',
      );
    }
    const stderr = (err.stderr || '').toString().trim();
    throw new AuditError(`gh failed: ${stderr || err.message}`);
  }
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d);
}

function parsePrRefs(body) {
  const refs = new Set();
  if (!body) return { hashes: new Set(), prs: refs };
  const hashes = new Set();
  let m;
  REVERTS_HASH_PATTERN.lastIndex = 0;
  while ((m = REVERTS_HASH_PATTERN.exec(body)) !== null) {
    hashes.add(m[1].toLowerCase());
  }
  REVERTS_PR_PATTERN.lastIndex = 0;
  while ((m = REVERTS_PR_PATTERN.exec(body)) !== null) {
    refs.add(Number(m[1]));
  }
  return { hashes, prs: refs };
}

function isRepairTitle(title) {
  return REPAIR_TITLE_PATTERNS.some((p) => p.test(title || ''));
}

async function fetchPRsInRange(repoArgs, sinceDate, untilDate) {
  // gh's search uses the PR's mergedAt for `merged:<since>..<until>`.
  const search = `merged:${sinceDate}..${untilDate} is:merged`;
  const args = [
    'pr',
    'list',
    ...repoArgs,
    '--state',
    'merged',
    '--search',
    search,
    '--limit',
    String(GH_PR_LIST_LIMIT),
    '--json',
    'number,title,body,mergedAt,mergeCommit,additions,deletions,files,author',
  ];
  const prs = await ghJson(args);
  return prs;
}

async function fetchPRFiles(repoArgs, number) {
  // Files are returned as a nested array on `gh pr list --json files`, but
  // `path` is the field. Fall back to per-PR view if needed.
  const args = [
    'pr',
    'view',
    String(number),
    ...repoArgs,
    '--json',
    'files',
  ];
  try {
    const data = await ghJson(args);
    return (data.files || []).map((f) => f.path);
  } catch {
    return [];
  }
}

/**
 * Audit a repo window. Returns a structured report.
 *
 * @param {object} opts
 * @param {string} [opts.repo]  - "owner/name". If omitted, gh uses the
 *                                current directory's git remote.
 * @param {string} opts.since   - YYYY-MM-DD (inclusive)
 * @param {string} opts.until   - YYYY-MM-DD (inclusive)
 * @param {number} [opts.survivalWindowDays=30]
 * @param {number} [opts.threshold=500]
 */
export async function auditRepo(opts) {
  const {
    repo,
    since,
    until,
    survivalWindowDays = DEFAULT_SURVIVAL_WINDOW_DAYS,
    threshold = CHANGE_UNIT_LINES,
  } = opts;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    throw new AuditError('since/until must be YYYY-MM-DD');
  }
  if (since > until) {
    throw new AuditError(`since (${since}) must be on or before until (${until})`);
  }

  const repoArgs = repo ? ['-R', repo] : [];
  const lookaheadUntil = addDays(until, survivalWindowDays);

  // Pull merged PRs in the window itself + the post-window lookahead so we
  // see reverts/repairs that happened after the original window closed.
  const inWindow = await fetchPRsInRange(repoArgs, since, until);
  const inLookahead =
    lookaheadUntil > until
      ? await fetchPRsInRange(repoArgs, addDays(until, 1), lookaheadUntil)
      : [];

  const truncated =
    inWindow.length >= GH_PR_LIST_LIMIT || inLookahead.length >= GH_PR_LIST_LIMIT;

  // Index merged PRs by short-hash for revert-by-hash matching.
  const shaIndex = new Map();
  for (const pr of [...inWindow, ...inLookahead]) {
    const oid = pr.mergeCommit?.oid?.toLowerCase();
    if (oid) {
      shaIndex.set(oid, pr.number);
      shaIndex.set(oid.slice(0, 7), pr.number);
    }
  }

  // Build invalidation map: { originalPRNumber -> { by, reason, date } }
  const invalidated = new Map();

  function markInvalidated(originalNum, by, reason, date) {
    if (!originalNum) return;
    const existing = invalidated.get(originalNum);
    if (!existing || date < existing.date) {
      invalidated.set(originalNum, { by, reason, date });
    }
  }

  for (const pr of [...inWindow, ...inLookahead]) {
    const { hashes, prs } = parsePrRefs(pr.body);
    if (REVERT_TITLE_PATTERN.test(pr.title || '') || hashes.size || prs.size) {
      // Resolve hash references back to original PRs.
      for (const h of hashes) {
        const target = shaIndex.get(h) || shaIndex.get(h.slice(0, 7));
        if (target && target !== pr.number) {
          markInvalidated(target, pr.number, 'revert', pr.mergedAt);
        }
      }
      for (const n of prs) {
        if (n !== pr.number) {
          markInvalidated(n, pr.number, 'revert', pr.mergedAt);
        }
      }
    }
  }

  // Heuristic candidates: repair-titled PRs in the lookahead window whose
  // files overlap with an in-window PR's files, within survival window.
  // We surface these as "needs review" but do not auto-invalidate.
  const repairCandidates = [];
  const inWindowByPath = new Map();
  for (const pr of inWindow) {
    const files = (pr.files || []).map((f) => f.path);
    for (const path of files) {
      if (!inWindowByPath.has(path)) inWindowByPath.set(path, []);
      inWindowByPath.get(path).push({ number: pr.number, mergedAt: pr.mergedAt });
    }
  }
  for (const pr of inLookahead) {
    if (!isRepairTitle(pr.title)) continue;
    const files = (pr.files || []).map((f) => f.path);
    const touchedOriginals = new Map();
    for (const path of files) {
      const candidates = inWindowByPath.get(path) || [];
      for (const c of candidates) {
        const ageDays =
          (new Date(pr.mergedAt) - new Date(c.mergedAt)) / 86_400_000;
        if (ageDays >= 0 && ageDays <= survivalWindowDays) {
          const cur = touchedOriginals.get(c.number) || {
            overlapFiles: 0,
            ageDays,
          };
          cur.overlapFiles += 1;
          touchedOriginals.set(c.number, cur);
        }
      }
    }
    for (const [origNum, info] of touchedOriginals) {
      if (invalidated.has(origNum)) continue;
      repairCandidates.push({
        repairPR: pr.number,
        repairTitle: pr.title,
        originalPR: origNum,
        overlapFiles: info.overlapFiles,
        ageDays: Math.round(info.ageDays),
      });
    }
  }

  // Build per-PR records for the in-window set.
  const now = new Date();
  const records = inWindow.map((pr) => {
    const inv = invalidated.get(pr.number);
    const ageDays = (now - new Date(pr.mergedAt)) / 86_400_000;
    const tooRecent = ageDays < survivalWindowDays;
    const linesChanged = (pr.additions || 0) + (pr.deletions || 0);
    return {
      number: pr.number,
      title: pr.title,
      mergedAt: pr.mergedAt,
      author: pr.author?.login,
      linesChanged,
      units: Math.max(1, Math.ceil(linesChanged / threshold)),
      survived: !inv,
      invalidatedBy: inv?.by,
      invalidationReason: inv?.reason,
      tooRecentToEvaluate: tooRecent,
    };
  });

  const survivors = records.filter((r) => r.survived);
  const acceptedChangeUnits = normalizeChanges(
    survivors.map((r) => ({ linesChanged: r.linesChanged })),
    threshold,
  );

  return {
    repo: repo ?? null,
    window: { since, until, survivalWindowDays, threshold },
    counts: {
      mergedPRs: inWindow.length,
      survivedPRs: survivors.length,
      invalidatedPRs: records.length - survivors.length,
      acceptedChangeUnits,
      tooRecentToEvaluate: records.filter((r) => r.tooRecentToEvaluate).length,
    },
    warnings: [
      ...(truncated
        ? [`gh result set hit the ${GH_PR_LIST_LIMIT}-PR limit; consider a shorter window`]
        : []),
      ...(records.some((r) => r.tooRecentToEvaluate)
        ? [
            `Some merged PRs are within the ${survivalWindowDays}-day survival window — their acceptance is provisional`,
          ]
        : []),
      ...(repairCandidates.length
        ? [
            `${repairCandidates.length} heuristic repair candidate(s) flagged — review the repairCandidates list and apply judgment per the FAQ`,
          ]
        : []),
    ],
    records,
    repairCandidates,
  };
}
