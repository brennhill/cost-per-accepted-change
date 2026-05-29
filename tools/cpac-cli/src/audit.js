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
// Extract the original PR title from GitHub's auto-revert title:
//   Revert "Original PR title here"
const REVERT_QUOTED_TITLE_PATTERN = /^\s*revert\s+"(.+)"\s*$/i;
const REVERTS_HASH_PATTERN = /This reverts commit ([0-9a-f]{7,40})/gi;
// Match plain `#N`, cross-repo `owner/repo#N` (we only invalidate when
// owner/repo matches the audited repo; cross-repo refs to other repos
// are ignored), and the variants GitHub's UI emits: `PR #N`,
// `pull request #N`, `pull-request #N`.
const REVERTS_PR_PATTERN =
  /(?:reverts?|reverting)\s+(?:pull[\s-]?request\s+|pr\s+)?(?:([\w.-]+\/[\w.-]+))?#(\d+)/gi;

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

function parsePrRefs(body, ownedRepoLower) {
  const prs = new Set();
  const hashes = new Set();
  if (!body) return { hashes, prs };
  let m;
  REVERTS_HASH_PATTERN.lastIndex = 0;
  while ((m = REVERTS_HASH_PATTERN.exec(body)) !== null) {
    hashes.add(m[1].toLowerCase());
  }
  REVERTS_PR_PATTERN.lastIndex = 0;
  while ((m = REVERTS_PR_PATTERN.exec(body)) !== null) {
    const ownerRepo = m[1] ? m[1].toLowerCase() : null;
    // Cross-repo refs only invalidate when the ref matches the audited
    // repo. Unqualified refs (no owner/repo prefix) are assumed local.
    if (ownerRepo && ownedRepoLower && ownerRepo !== ownedRepoLower) continue;
    prs.add(Number(m[2]));
  }
  return { hashes, prs };
}

function normalizeTitle(title) {
  return (title || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseQuotedRevertTitle(title) {
  const m = (title || '').match(REVERT_QUOTED_TITLE_PATTERN);
  return m ? normalizeTitle(m[1]) : null;
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
  const ownedRepoLower = repo ? repo.toLowerCase() : null;
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

  // Index merged PRs by SHA (full + 7-char short) and by normalized title.
  // Short-prefix collisions clear the entry so we never silently invalidate
  // the wrong PR when two merge commits share a 7-char prefix.
  const shaIndex = new Map();
  const shortShaCollisions = new Set();
  const titleIndex = new Map();
  for (const pr of [...inWindow, ...inLookahead]) {
    const oid = pr.mergeCommit?.oid?.toLowerCase();
    if (oid) {
      shaIndex.set(oid, pr.number);
      const short = oid.slice(0, 7);
      if (shaIndex.has(short)) {
        shortShaCollisions.add(short);
      } else {
        shaIndex.set(short, pr.number);
      }
    }
    const t = normalizeTitle(pr.title);
    if (t) {
      if (titleIndex.has(t)) titleIndex.set(t, null); // ambiguous
      else titleIndex.set(t, pr.number);
    }
  }
  for (const short of shortShaCollisions) shaIndex.delete(short);

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
    const { hashes, prs } = parsePrRefs(pr.body, ownedRepoLower);
    const isRevertTitle = REVERT_TITLE_PATTERN.test(pr.title || '');
    if (isRevertTitle || hashes.size || prs.size) {
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
      // Title-only revert resolution: GitHub's auto-revert UI emits
      // `Revert "Original title"`. Resolve by normalized-title equality
      // when neither hash nor PR ref was found.
      if (isRevertTitle && !hashes.size && !prs.size) {
        const origTitle = parseQuotedRevertTitle(pr.title);
        if (origTitle) {
          const targetNum = titleIndex.get(origTitle);
          if (targetNum && targetNum !== pr.number) {
            markInvalidated(targetNum, pr.number, 'revert-by-title', pr.mergedAt);
          }
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
        // Fractional-day comparison: same-second merges (ageDays===0)
        // count as same day; the boundary at exactly survivalWindowDays
        // is inclusive (a fix landing exactly N days later still
        // invalidates). DST/leap-second drift is negligible at day scale.
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
  //
  // A PR is "confirmed survived" only when (a) nothing invalidated it AND
  // (b) it has been at least `survivalWindowDays` since its merge. PRs
  // that survived but are still inside the survival window are
  // "provisional" — surfaced separately, not counted in the headline
  // denominator. This is the same discipline as cohort-based retention
  // measurement.
  const now = new Date();
  const records = inWindow.map((pr) => {
    const inv = invalidated.get(pr.number);
    const ageDays = (now - new Date(pr.mergedAt)) / 86_400_000;
    const tooRecent = ageDays < survivalWindowDays;
    const linesChanged = (pr.additions || 0) + (pr.deletions || 0);
    const survived = !inv;
    return {
      number: pr.number,
      title: pr.title,
      mergedAt: pr.mergedAt,
      author: pr.author?.login,
      linesChanged,
      units: Math.max(1, Math.ceil(linesChanged / threshold)),
      survived,
      confirmedSurvived: survived && !tooRecent,
      provisionalSurvived: survived && tooRecent,
      invalidatedBy: inv?.by,
      invalidationReason: inv?.reason,
      tooRecentToEvaluate: tooRecent,
    };
  });

  const confirmedSurvivors = records.filter((r) => r.confirmedSurvived);
  const provisionalSurvivors = records.filter((r) => r.provisionalSurvived);
  const acceptedChangeUnits = normalizeChanges(
    confirmedSurvivors.map((r) => ({ linesChanged: r.linesChanged })),
    threshold,
  );
  const provisionalChangeUnits = normalizeChanges(
    provisionalSurvivors.map((r) => ({ linesChanged: r.linesChanged })),
    threshold,
  );

  const tooRecentCount = records.filter((r) => r.tooRecentToEvaluate).length;
  return {
    repo: repo ?? null,
    window: { since, until, survivalWindowDays, threshold },
    counts: {
      mergedPRs: inWindow.length,
      confirmedSurvivedPRs: confirmedSurvivors.length,
      provisionalSurvivedPRs: provisionalSurvivors.length,
      invalidatedPRs: records.length - confirmedSurvivors.length - provisionalSurvivors.length,
      acceptedChangeUnits,
      provisionalChangeUnits,
      tooRecentToEvaluate: tooRecentCount,
    },
    warnings: [
      ...(truncated
        ? [`gh result set hit the ${GH_PR_LIST_LIMIT}-PR limit; consider a shorter window`]
        : []),
      ...(tooRecentCount > 0
        ? [
            `${tooRecentCount} merged PR(s) are within the ${survivalWindowDays}-day survival window — counted as provisional, NOT in acceptedChangeUnits (the headline denominator)`,
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
