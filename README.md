# Sopher: software capitalization autopilot for Jira

Sopher turns the engineering work already tracked in Jira into an audit-ready **software capitalization schedule**. It follows ASC 350-40 / IAS 38: it classifies every time log as capitalized or expensed, gives a reason for each decision, amortizes each software asset, and publishes the quarter-end memo to Confluence.

Built on Atlassian Forge for **Codegeist 2026**, in the *Apps for Business Teams* category (finance).

## The problem

Software companies must capitalize development-stage work on internal-use software and expense the rest (research, bugs, maintenance, post-release work). Most finance teams estimate the split with quarterly surveys sent to engineers. Sopher uses what Jira already records: what was built, when, by whom and for how long.

## What it does

- **Classification engine.** Each time log is classified by the project stage on its date:
  - preliminary (before authorization): expensed
  - application development: capitalized
  - post-implementation (after release): expensed

  Bugs, maintenance and spikes are always expensed. Unclear items go to a review queue. Every decision comes with reasons.
- **Dashboard** (Apps → Capitalization): capitalized vs. expensed totals, capitalization rate, amortization, net book value, a four-quarter trend, each software asset (epic) with its stage, and the review queue.
- **Issue panel:** how each issue was treated and why, with a controller override that requires a reason.
- **Confluence memo:** a one-click quarter-end memo (summary, assets, review items, method, sign-off). Publishing again updates the same page.
- **Rovo agent "Cap Analyst"** with actions `get-schedule`, `explain-classification`, `list-review-queue` and `draft-cap-memo`. The read actions are also exposed as an **MCP server** (`rovo:mcp`).
- **Demo data loader:** fills an empty project with a sample payments team, so you can try Sopher on an empty site.

## Try it

1. Install Sopher on your Jira site from the installation link on the Devpost page. Add it to Confluence too if you want memos.
2. Create an empty company-managed Scrum project, for example key `DEMO`, and make sure time tracking is on.
3. Go to **Jira settings → Apps → Sopher settings → Demo data**, enter `DEMO`, and click **Load demo data**.
4. Open **Apps → Capitalization** and choose **2026-Q3** or **2026-Q4**.

## Develop

```bash
npm install
npm test            # engine, demo dataset, memo and seeder tests
forge deploy -e development
forge install --site <your-site>.atlassian.net --product jira -e development
```

The code is laid out as follows:
- `src/engine/`: pure classification, schedule, dates and memo logic, with no Forge calls
- `src/data/`: Jira, Confluence and Forge storage access, plus the demo seeder
- `src/index.js`: UI resolvers and Rovo actions
- `src/frontend/`: UI Kit pages

## Privacy and support

See [PRIVACY.md](PRIVACY.md). For questions and issues, use [GitHub Issues](https://github.com/ArhaanDev24/sopher/issues).

Sopher is decision support: controllers make the final call and can override any classification.
