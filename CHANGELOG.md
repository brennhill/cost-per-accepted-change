# Changelog — cost per accepted change

All notable changes to the definition, the calculator library, and the reference site.

This file follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions. The definition itself follows [Semantic Versioning](https://semver.org/) — major versions reserved for breaking changes to the formula or to the unit of "accepted change."

## v0.1.0 — 2026-05-22 (reference release)

The first public version of the definition, calculator, and reference site.

### Definition

- **Formula:** `(model cost + infrastructure + engineering time + review cost + rework cost) ÷ accepted change units`
- **Accepted change unit:** a merged pull request to the production branch (or, on non-PR workflows, the squash-merge or merge commit that lands a logical change set), size-normalized — `max(1, ceil(LOC / 500))` units per change. Lines = additions + deletions, excluding vendored, generated, lockfile, and bulk-import content.
- **"Stayed there" window:** 30 days post-merge (recommended default; 14 or 60–90 days are acceptable alternatives that must be applied consistently).
- **Invalidation:** a change does not count if, within its window, it is reverted, substantively rewritten to fix a defect it introduced, or feature-flag-disabled. Incremental improvement, refactoring, and iteration that builds on the change do not invalidate.

### Calculator library

- `costPerAcceptedChange(inputs)` — pure reference implementation.
- `normalizeChanges(changes, threshold=500)` — size normalization helper.
- `formatCurrency`, `formatShare` — presentation helpers.
- 23 unit tests covering validation, edge cases, and formatter behavior.

### Reference site

- Definition, calculator, quick-start playbook, how-to-use guide, measurement comparison, FAQ, citation, press kit, instrumentation guide, templates landing, quarterly review template, leaderboard (placeholder).
- Downloadable XLSX tracker with formulas, conditional formatting, and instructions tab.
- Print-ready quarterly review template.
- Social share assets (OG image, square + portrait post images, marks).
- Source Serif 4 embedded for byte-stable rendering on all hosts.

### Known limitations at v0.1

- The leaderboard is a placeholder; no public submissions yet.
- Per-change model-cost attribution requires team setup (LLM proxy + tagging or git-ai integration); the canonical recipe assumes aggregate billing per team.
- Recipes in the instrumentation guide are GitHub-centric. Equivalent recipes for GitLab and Bitbucket are welcome contributions.

## Process

Proposed changes to the definition (formula, normalization, survival window, invalidation criteria) require:

1. An issue describing the proposed change and its motivation.
2. At least one real-world measurement window applied under both the current and proposed definitions, with the differences disclosed.
3. Public review for at least four weeks.

Refinements to the recipes, worked examples, and supporting documentation can be proposed via pull request without the full process.
