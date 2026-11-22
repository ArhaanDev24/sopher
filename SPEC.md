# Sopher: software capitalization autopilot for Jira

*Codegeist 2026 entry. Working name is Sopher (same as the folder). Deadline: **Dec 23, 2026, 1:30am IST** (Dec 22, 20:00 UTC).*

## One-liner
Sopher turns the engineering work already tracked in Jira into an audit-ready software capitalization schedule. It classifies work as capex or opex under ASC 350-40 / IAS 38, gives a reason for every decision, and comes with a Rovo agent that finance and auditors can question.

## Problem
Software companies must capitalize development-stage work on internal-use software and expense everything else (research, planning, bugs, maintenance). Most finance teams estimate the split with quarterly surveys sent to engineers. The numbers are guesses, the evidence is thin, auditors push back, and each close costs controllers days. Jira already holds the real record (what was built, when, by whom, and how long it took), but nobody turns it into accounting output.

**Who it's for:** controllers, technical accounting and FP&A at software companies, plus the engineering managers who answer the surveys today.

## Category
**Apps for Business Teams.** The brief names finance teams explicitly ("help colleagues in … finance … move faster"), and our users are finance colleagues working next to engineering. The fallback is Specialized Industries, but our users are a finance *function* inside software companies, not the finance *industry*, so Business Teams is the honest fit.

## Core logic (the non-trivial part)
1. **Project stage per epic.** Each epic is in one of three ASC 350-40 stages:
   - *Preliminary* (research, discovery, spikes): expensed
   - *Application development* (from project authorization, i.e. an approved spec or epic status, until release): capitalized
   - *Post-implementation* (after release or go-live): expensed

   Signals used: epic status history, the linked Confluence spec's status and approval date, the fixVersion release date, labels, and components.
2. **Item classification.** Each issue under an epic is classified with rules: Bug, maintenance and support work is expensed. New-feature stories in the development stage are capitalized. Spikes and research are expensed.

   Every decision records its **reason and its evidence links**. Low-confidence items (missing epic, conflicting signals) go into a review queue.
3. **Costing.** Worklog hours × loaded hourly rate (set per team or role in admin settings) = cost. Items without worklogs fall back to story points or time in status, and are flagged as estimated.
4. **Schedule.** Capitalized cost rolls up per project (asset) and quarter. Each asset gets an in-service date from its release date and straight-line amortization over a configurable useful life.
5. **Controller overrides.** Any classification can be overridden. Overrides need a reason and are kept as an audit trail.

The core rules are deterministic, so the results can be reproduced and explained, and there is no LLM cost. Rovo handles the explanation and Q&A layer.

## Surfaces (Forge modules)
| Module | What it shows |
|---|---|
| `jira:globalPage` "Capitalization" | Dashboard: quarter picker, capex vs. opex totals, per-project schedule, review queue, export as CSV or a Confluence page |
| `jira:issuePanel` | Classification of the current issue, with its reason, evidence and an override control |
| `jira:adminPage` | Rates, useful life, stage mapping rules, and the **Load demo data** button |
| `rovo:agent` "Cap Analyst" | Answers questions like "Why is Atlas capitalized from Oct 3?", "What's unclassified in Q3?" and "Draft the Q3 capitalization memo" |
| `rovo:action` × ~4 | `get-schedule`, `explain-classification`, `list-review-queue`, `draft-cap-memo` (creates a Confluence page) |
| `rovo:mcp` | Exposes the same actions as MCP tools, so ERP, close or audit agents can pull the schedule (an easy bonus that reuses the actions) |
| Teamwork Graph | Traverses epic → issues → worklogs → users → Confluence spec → PRs and deployments, which serve as evidence links and release signals |

## Bonus prizes we're targeting
- **Rovo agents:** `rovo:agent` plus reusable `rovo:action`s. Core to the product.
- **Atlassian MCP:** `rovo:mcp` over the same actions. Low cost.
- **Teamwork Graph:** consumes the TWG API with `read:graph:*` scopes. ⚠️ The API is in Preview, and new apps must use curated or persisted queries (no raw Cypher). **Mitigation:** every TWG read has a Jira/Confluence REST fallback, so the app still works if TWG returns empty.
- **Marketplace:** ⚠️ **Skip for now.** Forge docs say apps submitted to Marketplace *cannot be shared by installation link*, and an installation link is a hard submission requirement. We'd only consider it late, using a second app registration.

## Submission checklist (from the rules)
- [ ] Built on Forge and integrated with Jira, Confluence, Rovo and TWG ✅ by design
- [ ] **Installation link:** `forge deploy -e production`, then in the developer console go to Distribution → Sharing → copy the link. Installers must be site admins.
- [ ] **Judges can test on an empty site:** the admin "Load demo data" action seeds a sample project (3 epics, about 60 issues, worklogs, a linked spec page) so judges don't need their own data. This matters a lot for the "not a hardcoded demo path" criterion.
- [ ] Testing instructions in the Devpost write-up: install link, seed demo data, where to click, sample agent prompts
- [ ] **Demo video under 5 minutes, public on YouTube**, showing the problem, the dashboard, the issue panel and override, the Rovo agent Q&A and memo, MCP in Rovo Studio, and a TWG evidence trail
- [ ] Category (Business Teams) and bonus prizes named, plus the materials each bonus needs
- [ ] Explanation of how it meets the tech requirement (module list above)
- [ ] Full Devpost form submitted **before Dec 22**, leaving a buffer

## Plan (≈30 days)
| Dates | Milestone |
|---|---|
| Nov 22–25 | Scaffold Forge app, manifest, scopes, demo-data seeder, Jira REST data layer |
| Nov 26–Dec 3 | Classification engine and costing, with unit tests on fixture data |
| Dec 4–9 | Global page dashboard, issue panel, admin page (UI Kit) |
| Dec 10–13 | Rovo agent and actions, Confluence memo, rovo:mcp |
| Dec 14–16 | Teamwork Graph evidence trail (REST fallback already in place) |
| Dec 17–19 | Polish, test install on a fresh site via the share link |
| Dec 20–21 | Record and edit the video, write the Devpost entry, submit |

## Risks
- **TWG Preview gaps** → REST fallback (see above)
- **Rovo not enabled on a judge's site** → the dashboard and issue panel work fully without Rovo, and the agent is a bonus surface
- **Forge storage and runtime limits** on large projects → compute per quarter and per project, cache results in Forge KVS
- **Accounting accuracy** → we say clearly that this is decision support with a controller override, not automatic bookkeeping
