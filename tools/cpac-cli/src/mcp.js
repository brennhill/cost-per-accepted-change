// cpac-mcp — stdio MCP server exposing CPAC tools to agents.
//
// Tools:
//   calculate_cpac    — pure math: 5 cost components + denominator → CPAC
//   normalize_changes — list of {linesChanged} → accepted-change-unit count
//   audit_repo        — gh-backed audit of a GitHub repo window
//
// Transport: stdio. Add to Claude Code / Cursor / any MCP-aware client as
// `npx cost-per-accepted-change-cli cpac-mcp`. No network needed besides
// what `gh` already uses.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  costPerAcceptedChange,
  normalizeChanges,
  formatCurrency,
  formatShare,
  CHANGE_UNIT_LINES,
  InvalidCPACInputError,
} from './calculator.js';
import { auditRepo, AuditError } from './audit.js';

const SERVER_NAME = 'cost-per-accepted-change';
const SERVER_VERSION = '0.1.0';

function jsonContent(obj) {
  return {
    content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }],
  };
}

function errorContent(message) {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}

export function buildServer() {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        'Tools for computing cost per accepted change (CPAC). The metric ' +
        'is the fully-loaded cost of producing software that reached ' +
        'production and stayed there, divided by the number of changes ' +
        'that did. Canonical definition: https://costperacceptedchange.org. ' +
        'Use audit_repo to compute the denominator from a real GitHub ' +
        'repository (requires gh CLI on PATH and the user to be ' +
        'authenticated). Use calculate_cpac for the headline math once ' +
        'all five cost components and the denominator are known.',
    },
  );

  server.registerTool(
    'calculate_cpac',
    {
      title: 'Calculate cost per accepted change',
      description:
        'Compute CPAC from the five numerator cost components and the ' +
        'denominator (count of accepted change units, already normalized). ' +
        'All cost inputs are in the same currency. Returns the headline ' +
        'value and per-component share of total cost.',
      inputSchema: {
        modelCost: z
          .number()
          .min(0)
          .describe('LLM / API spend attributable to the changes (currency).'),
        infraCost: z
          .number()
          .min(0)
          .describe('Compute / storage / observability / tooling overhead.'),
        engineeringTime: z
          .number()
          .min(0)
          .describe('Engineering time spent steering, prompting, integrating (currency).'),
        reviewCost: z
          .number()
          .min(0)
          .describe('Time reviewing / gating AI-generated changes (currency).'),
        reworkCost: z
          .number()
          .min(0)
          .describe("Cost of fixing or reverting changes that didn't stay in production."),
        acceptedChanges: z
          .number()
          .int()
          .min(1)
          .describe('Denominator — count of size-normalized accepted change units.'),
      },
    },
    async (args) => {
      try {
        const result = costPerAcceptedChange(args);
        return jsonContent({
          value: result.value,
          formatted: formatCurrency(result.value),
          totalCost: result.totalCost,
          acceptedChanges: result.acceptedChanges,
          breakdown: result.breakdown,
          breakdownFormatted: {
            modelCost: formatShare(result.breakdown.modelCost),
            infraCost: formatShare(result.breakdown.infraCost),
            engineeringTime: formatShare(result.breakdown.engineeringTime),
            reviewCost: formatShare(result.breakdown.reviewCost),
            reworkCost: formatShare(result.breakdown.reworkCost),
          },
        });
      } catch (err) {
        if (err instanceof InvalidCPACInputError) return errorContent(err.message);
        throw err;
      }
    },
  );

  server.registerTool(
    'normalize_changes',
    {
      title: 'Normalize merged changes into accepted-change units',
      description:
        'Apply the 500-LOC size-normalization rule from the CPAC spec. ' +
        'Each change of 1..threshold lines counts as 1 unit; larger ' +
        'changes count as ceil(N / threshold). Use this to convert a ' +
        'list of merged PRs (with their additions+deletions totals) ' +
        'into the CPAC denominator. The default threshold (500) matches ' +
        'the canonical definition.',
      inputSchema: {
        changes: z
          .array(
            z.object({
              linesChanged: z
                .number()
                .nonnegative()
                .describe(
                  'additions + deletions, excluding vendored / generated / lockfiles. ' +
                    'Entries with linesChanged === 0 are accepted and silently skipped ' +
                    '(they contribute 0 units), matching the calculator core.',
                ),
            }),
          )
          .describe('List of merged changes that stayed in production.'),
        threshold: z
          .number()
          .positive()
          .max(100000)
          .optional()
          .describe(`Lines per unit. Default ${CHANGE_UNIT_LINES}.`),
      },
    },
    async (args) => {
      try {
        const units = normalizeChanges(args.changes, args.threshold);
        return jsonContent({
          acceptedChangeUnits: units,
          threshold: args.threshold ?? CHANGE_UNIT_LINES,
          inputChangeCount: args.changes.length,
        });
      } catch (err) {
        if (err instanceof InvalidCPACInputError) return errorContent(err.message);
        throw err;
      }
    },
  );

  server.registerTool(
    'audit_repo',
    {
      title: 'Audit a GitHub repo window for CPAC denominator',
      description:
        'Walk a GitHub repository over a date window, fetch merged PRs, ' +
        'detect reverts and explicit "reverts #N" references, and apply ' +
        'the 500-LOC normalization to produce the accepted-change-unit ' +
        'count for that window. Conservative — heuristic repair ' +
        'candidates (hotfix-titled PRs touching overlapping files within ' +
        'the survival window) are surfaced for human review but not ' +
        'auto-applied. Requires the gh CLI installed and authenticated. ' +
        'For the full CPAC, pair the returned acceptedChangeUnits with ' +
        'calculate_cpac and your five cost-component inputs.',
      inputSchema: {
        repo: z
          .string()
          .regex(/^[^/\s]+\/[^/\s]+$/)
          .optional()
          .describe('owner/name. If omitted, uses the current directory\'s git remote.'),
        since: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe('Window start (inclusive, merged-at), YYYY-MM-DD.'),
        until: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe('Window end (inclusive, merged-at), YYYY-MM-DD.'),
        survivalWindowDays: z
          .number()
          .int()
          .positive()
          .max(365)
          .optional()
          .describe('Days a change must persist post-merge to be "accepted". Default 30.'),
        threshold: z
          .number()
          .int()
          .positive()
          .max(100000)
          .optional()
          .describe(`LOC normalization threshold. Default ${CHANGE_UNIT_LINES}.`),
      },
    },
    async (args) => {
      try {
        const report = await auditRepo(args);
        return jsonContent(report);
      } catch (err) {
        if (err instanceof AuditError) return errorContent(err.message);
        throw err;
      }
    },
  );

  return server;
}

export async function run() {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
