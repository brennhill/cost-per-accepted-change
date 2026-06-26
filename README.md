# AI FinOps

**AI FinOps** — measuring and governing the dollar cost of producing and running trusted AI software. Two metrics anchor it:

- **Cost per accepted change (CPAC)** — the cost of producing software that reached production and stayed there (for development).
- **Cost per accepted outcome (CAPO)** — the cost of agent work that was accepted and stayed accepted (for running agents).

Deployed at **[aifinops.dev](https://aifinops.dev)**.

## The metrics

```
                        cost per accepted change
(model + infrastructure + engineering time + review + rework)
─────────────────────────────────────────────────────────────
                       accepted change units

                        cost per accepted outcome
(inference + tools + infra + oversight + remediation + failed runs + failure impact)
────────────────────────────────────────────────────────────────────────────────────
                       accepted outcome units
```

An *accepted change* (or *outcome*) is one that reached production / was produced **and stayed there**. For agents, the *outcome* is the value unit; the *action* is the loggable primitive beneath it.

**Cost per accepted change** is defined in *The Delivery Gap* (Brenn Hill, 2026) as the cost vertex of the Verification Triangle. **Cost per accepted outcome (CAPO)** was coined by [Nikhil Mungel](https://www.infoworld.com/article/4138748/finops-for-agents-loop-limits-tool-call-caps-and-the-new-unit-economics-of-agentic-saas.html) (InfoWorld, 2026); this project adopts it as the runtime sibling and adds the cost-component decomposition, the survival window, and the LoopRails oversight bridge.

## This repository

| Path | Purpose |
|---|---|
| `src/pages/` | The website pages (definition, calculator, FAQ, citation, leaderboard) |
| `src/lib/calculator.ts` | Pure TypeScript implementation of the metric, importable as a library |
| `src/layouts/` | Shared layout |
| `src/styles/` | Global CSS |
| `public/` | Static assets |

## Development

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # build to dist/
npm run preview  # preview built site
```

## Deployment

Deployed via **Cloudflare Pages** to `aifinops.dev`.

- **Build command:** `npm run build`
- **Build output:** `dist`
- **Node version:** `24` (set `NODE_VERSION=24` in Pages env vars)
- **Headers:** declared in `public/_headers` — copied to the build output by Astro and consumed by Cloudflare Pages.

To deploy from a local checkout (one-off):

```bash
npm run build
npx wrangler pages deploy dist --project-name=cost-per-accepted-change
```

The recommended setup is the GitHub integration: connect the repo in the Cloudflare Pages dashboard and every push to `main` builds and deploys automatically.

## Using the calculator as a library

```ts
import { costPerAcceptedChange } from './src/lib/calculator';

const cpac = costPerAcceptedChange({
  modelCost: 1200,
  infraCost: 400,
  engineeringTime: 18000,
  reviewCost: 6000,
  reworkCost: 2400,
  acceptedChanges: 42,
});

console.log(cpac.value); // 666.67
console.log(cpac.breakdown);
```

## Contributing

Issues and pull requests welcome. The goal is for the definition to remain stable; refinements to the calculator, worked examples, and supporting documentation are encouraged.

## License

MIT.
