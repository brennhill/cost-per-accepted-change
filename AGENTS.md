# Cost Per Accepted Change — project & contributor guide

The canonical definition, calculator, and reference for **cost per accepted change** — a measurement for the true cost of producing trusted software in the AI-augmented era. Built with Astro; deployed at [costperacceptedchange.org](https://costperacceptedchange.org).

This guide is the source of truth for **how the site sounds**. It applies to every page, every field note, and every commit message. (`CLAUDE.md` imports this file.)

---

## Voice & tone — the most important section

Our readers — engineering leaders, finance partners, and developers — are all trying to figure out what AI really does to the cost and quality of software. They are smart, they are busy, and they are under real pressure. **We are here to help them, not to judge them.**

The whole site should read like a generous, plainspoken colleague who has thought hard about this and wants to make your job easier. Confident about the idea; warm and humble about people.

### Principles

1. **Assume good faith — always.** The teams and vendors we write about moved fast and shared a great deal in the open; that openness is the only reason we can learn from them at all. Never a scorecard, never a gotcha, never "they should have known better." We read the public record *generously*.
2. **Be warm and human.** Write like a helpful peer, not a consultant grading homework. Genuine excitement about what works is welcome — when a tool or team did something well, say so plainly.
3. **Be generous to other metrics and tools.** Token cost, DORA, SPACE, acceptance rate, velocity dashboards — they all measure something real. Cost per accepted change *adds a view*; it does not dunk on the alternatives. Reach for "complementary," "leading indicator," "one more number," not "vanity metric," "theater," or "the wrong half."
4. **Be honest about limits — ours included.** Label hypotheticals as hypotheticals. Cite sources. Flag uncertainty. Be careful about the leap from one study to a sweeping claim, and say when a number is contested or thin.
5. **Be confident, not cynical.** Keep the sharp insight ("AI made code *generation* faster, not *delivery* faster"). Drop the contempt. Critique ideas and measurement gaps; never people.
6. **Be plain and finance-legible.** Short words, concrete numbers, no jargon for its own sake.

### Word swaps (lean away → lean toward)

| Lean away from | Lean toward |
| --- | --- |
| "vanity metrics" | "activity metrics," "surface metrics" |
| "optimization theater" | "a false saving," "an easy trap to fall into" |
| "measuring the wrong half" | "measuring the half that's easy to see" |
| "X is invisible / a lie" | "X doesn't show up here," "X is hard to see" |
| "the naive comparison" | "the tempting comparison," "the simple comparison" |
| "they failed to measure" | "this was genuinely hard to measure," "the dashboards weren't built to show it" |
| "second-guessing the team" | "reading the public record" |
| "this punishes / catches teams" | "this helps teams see / steer" |

### The litmus test

> Would this sentence still feel kind if the team it describes were reading it over your shoulder?

If not, rewrite it. Keep the insight, lose the edge.

---

## Field notes (`/articles/field-notes/*`)

Illustrative analyses of real, publicly-reported AI rollouts, read through the cost-per-accepted-change lens. Extra rules on top of the voice guide:

- **Public, citable data only.** No inside information. No invented numbers.
- **Assume good faith and say it.** Thank teams for shipping and sharing in the open. The goal is to help everyone reason better, not to grade anyone.
- **Any worked dollar example is a clearly-labeled hypothetical** — never attributed as a company's real figures.
- **Cite every factual claim** inline and in a numbered Sources list with working URLs. Distinguish company/vendor claims from independent research, and note each study's limits (sample size, correlation vs causation).
- **Frame CPAC as a helpful lens, not a verdict.** "Here's a number that brings the hard-to-see part into view," not "here's where they went wrong."

---

## Content & SEO conventions

- Every page renders through `src/layouts/BaseLayout.astro`, which emits a sitewide JSON-LD `@graph` (`WebSite` + `Person`) and an auto-generated `BreadcrumbList`. Pass page-specific schema via the `jsonLd` prop; pass ancestor crumbs for deep pages via the `breadcrumbs` prop.
- Field notes carry `Article` schema with `author`, dates, `articleSection: 'Field Notes'`, and a `citation[]` of their sources.
- One `<h1>` per page. Unique `title` and `description` per page.
- Shared CSS vocabulary (in `src/styles/global.css`): `.page`, `.lede`, `.eyebrow`, `.callout`, `.sidebar`, `.template-grid` / `.template-card`, `.btn`, `.crumbs`, `.article-meta`, `.sources`.

## Build & checks

```bash
npm run build      # astro build + generates .md siblings (scripts/build-markdown.mjs)
npx astro check    # expect 0 errors, 0 warnings
npm test           # vitest (calculator unit tests)
```
