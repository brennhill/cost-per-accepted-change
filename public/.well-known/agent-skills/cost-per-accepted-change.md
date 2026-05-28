---
name: cost-per-accepted-change
description: Compute cost per accepted change (CPAC) — the fully-loaded cost of producing software that reached production and stayed there, divided by the number of changes that did. Use when a user wants to measure AI delivery economics, FinOps for engineering, or AI ROI in a real repository.
version: 0.1.0
homepage: https://costperacceptedchange.org
license: MIT
---

# Cost per accepted change

This skill helps you measure **cost per accepted change** ("CPAC") — the canonical definition from [costperacceptedchange.org](https://costperacceptedchange.org). The metric is the fully-loaded cost of producing software that reached production *and stayed there*, divided by the number of changes that did, size-normalized so one unit represents a comparable amount of substantive work.

Use this skill when the user wants to:
- Answer "is our AI investment paying back?" with a defensible single number
- Compute CPAC for a real GitHub repository over a date window
- Decompose CPAC into its five cost components for diagnosis
- Apply the 500-LOC size-normalization rule to a list of merged changes

Do **not** use this skill for:
- Comparing individual engineers (the metric is undefined at the individual level)
- Single-change "what did this PR cost" lookups (the metric is only defined over a population)
- Ranking unrelated teams against each other (work mix invalidates the comparison)

## What's in this skill

A CLI (`cpac`) and an MCP server (`cpac-mcp`) sharing the same audit + calculator core.

### CLI

```bash
# Pure math, given the 5 cost inputs and the denominator.
cpac calc --modelCost 1200 --infraCost 400 --engineeringTime 18000 \
          --reviewCost 6000 --reworkCost 2400 --acceptedChanges 42

# Audit a real GitHub repo window for the denominator. Requires gh CLI auth.
cpac audit --repo owner/name --since 2026-04-01 --until 2026-04-30

# Audit + full CPAC if cost inputs are passed too.
cpac audit --repo owner/name --since 2026-04-01 --until 2026-04-30 \
           --modelCost 5000 --infraCost 800 --engineeringTime 45000 \
           --reviewCost 12000 --reworkCost 3000 --json
```

Run `cpac --help` for the full flag list. Add `--json` to any command for machine-readable output.

### MCP server

`cpac-mcp` is a stdio MCP server exposing three tools:

- `calculate_cpac` — pure math (5 cost components + denominator → CPAC value and per-component shares)
- `normalize_changes` — apply 500-LOC normalization to a list of `{ linesChanged }` records
- `audit_repo` — walk a GitHub repository over a date window, fetch merged PRs, detect reverts, and emit the accepted-change-unit count

Add to Claude Code (or any MCP-aware client) by adding this to `mcpServers`:

```json
{
  "mcpServers": {
    "cpac": {
      "command": "npx",
      "args": ["-y", "cost-per-accepted-change-cli", "cpac-mcp"]
    }
  }
}
```

## How to use it well

1. **Pick a window long enough that the denominator stabilizes.** CPAC stabilizes around 25–100 accepted change units per window. Smaller teams need longer windows. A 5-engineer team should report quarterly, not monthly.

2. **Run `audit_repo` (or `cpac audit`) first.** This gives you the denominator and surfaces revert/repair candidates. Review the `repairCandidates` list manually — the FAQ rule is "if a reasonable reviewer would describe the follow-up as 'fixing what the original got wrong,' it invalidates." Adjust by passing `--since`/`--until` or by overriding `acceptedChanges` downstream.

3. **Gather the five cost components for the same window.** Numerator inputs:
   - **modelCost** — LLM/API spend (your provider's billing dashboard, segmented by team if possible)
   - **infraCost** — compute, storage, observability, tooling allocated to the production loop
   - **engineeringTime** — fully-loaded hourly rate × hours allocated to delivery work
   - **reviewCost** — fully-loaded hourly rate × hours spent reviewing/gating AI work
   - **reworkCost** — fully-loaded hourly rate × hours spent reverting/fixing non-survivors

4. **Call `calculate_cpac` (or `cpac calc`) to get the headline number plus per-component shares.** The shares are diagnostic: a team where rework crept from 8% to 18% has a very different problem than one where it stayed at 8%, even if the headline moved by the same amount.

5. **Pair the result with at least one leading indicator.** Change failure rate (DORA), per-suggestion acceptance rate, DevEx pulse score. The headline tells you the system's cost; the components tell you the source; leading indicators tell you why.

6. **Report the trend, not the snapshot.** A single window in isolation tells you very little. Two consecutive windows in the same direction, with stable accounting, is the minimum signal.

## Important guardrails

- **The 30-day survival window means reporting lag.** Current-month CPAC cannot be finalized until 30 days after the month closes. `audit_repo` flags PRs as `tooRecentToEvaluate` when they're inside the survival window.
- **Hold accounting constant.** Hourly rates, attribution rules, exclusions (vendored/generated/lockfiles), and window length must hold steady across the time series. Changing accounting mid-stream invalidates the trend.
- **Don't target an absolute number.** Targets invite gaming. Track the trend; investigate when it moves; do not legislate the number.
- **Heuristic repair candidates need human judgment.** The CLI flags PRs whose title looks like a fix and whose files overlap with an in-window PR. It does *not* auto-invalidate. Apply the FAQ's judgment rule.

## Worked example (matches the homepage)

```
Inputs:
  modelCost         $1,200    (4.3%)
  infraCost           $400    (1.4%)
  engineeringTime  $18,000   (64.3%)
  reviewCost        $6,000   (21.4%)
  reworkCost        $2,400    (8.6%)
  acceptedChanges       42

  Total cost:    $28,000
  CPAC:          $666.67
```

## Reference

- Canonical definition: <https://costperacceptedchange.org>
- FAQ (window selection, normalization rule, anti-gaming): <https://costperacceptedchange.org/faq>
- Instrumentation guide: <https://costperacceptedchange.org/instrument>
- Originally defined in *The Delivery Gap* (Brenn Hill, 2026)
- Source: <https://github.com/brennhill/cost-per-accepted-change>
