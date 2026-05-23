# Cost Per Accepted Change

Canonical definition, calculator, and (forthcoming) leaderboard for **cost per accepted change** — a measurement for the true cost of producing trusted software in the AI-augmented era.

Deployed at **[costperacceptedchange.org](https://costperacceptedchange.org)**.

## The metric

```
(model cost + infrastructure cost + engineering time + review cost + rework cost)
─────────────────────────────────────────────────────────────────────────────────
                              accepted changes
```

An *accepted change* is one that reached production **and stayed there**.

Originally defined in *The Delivery Gap* (Brenn Hill, 2026) as the cost vertex of the Verification Triangle.

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

Deployed via **Cloudflare Pages** to `costperacceptedchange.org`.

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
