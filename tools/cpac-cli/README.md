# cost-per-accepted-change-cli

CLI and MCP server for computing [cost per accepted change](https://costperacceptedchange.org) against a real GitHub repository.

```bash
npx cost-per-accepted-change-cli cpac --help
```

## Two binaries, one core

| Binary     | Purpose                                                  |
|------------|----------------------------------------------------------|
| `cpac`     | Interactive CLI: `cpac calc`, `cpac audit`               |
| `cpac-mcp` | stdio MCP server exposing the same logic to AI agents    |

Both share the same audit + calculator core. `gh` CLI is required for `audit_repo` / `cpac audit` (authentication, pagination, and rate-limit handling come for free).

## Install

```bash
# Run without installing
npx cost-per-accepted-change-cli cpac --help

# Or install globally
npm install -g cost-per-accepted-change-cli
cpac --help
```

## CLI

### Pure calculation

```bash
cpac calc --modelCost 1200 --infraCost 400 \
          --engineeringTime 18000 --reviewCost 6000 --reworkCost 2400 \
          --acceptedChanges 42
# Cost per accepted change: $666.67
#   Total cost: $28,000.00
#   Accepted change units: 42
#   Component shares:
#     model       4.3%
#     infra       1.4%
#     eng        64.3%
#     review     21.4%
#     rework      8.6%
```

### Audit a real repository

```bash
cpac audit --repo brennhill/cost-per-accepted-change \
           --since 2026-04-01 --until 2026-04-30
```

Pulls every merged PR in the window, detects reverts and explicit `Reverts #N` references, surfaces heuristic repair candidates (hotfix-titled PRs whose files overlap with an in-window PR — never auto-invalidated), and applies the 500-LOC normalization rule from the [CPAC spec](https://costperacceptedchange.org/faq#size-normalization).

Pass the five cost components alongside to compute the full CPAC:

```bash
cpac audit --repo owner/name --since 2026-04-01 --until 2026-04-30 \
           --modelCost 5000 --infraCost 800 --engineeringTime 45000 \
           --reviewCost 12000 --reworkCost 3000 --json
```

## MCP server

```jsonc
// Claude Code, Cursor, or any MCP-aware client
{
  "mcpServers": {
    "cpac": {
      "command": "npx",
      "args": ["-y", "cost-per-accepted-change-cli", "cpac-mcp"]
    }
  }
}
```

Tools exposed:

- `calculate_cpac` — 5 cost components + denominator → CPAC value and per-component shares
- `normalize_changes` — apply 500-LOC normalization to a list of `{ linesChanged }`
- `audit_repo` — walk a GitHub repo window, detect reverts, emit accepted-change-unit count

The skill manifest is [SKILL.md](./SKILL.md). The site advertises this skill at <https://costperacceptedchange.org/.well-known/agent-skills/index.json>.

## License

MIT. See the [canonical definition](https://costperacceptedchange.org) for the metric itself. Originally defined in *The Delivery Gap* (Brenn Hill, 2026).
