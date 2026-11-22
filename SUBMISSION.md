# Sopher: Codegeist 2026 submission pack

Everything the Devpost form asks for, plus a check against the rules and judging criteria. The installation link isn't in this file; it's in `submission.local.md`, which git ignores.

---

## 1. Requirements checklist

| Requirement (from the Devpost page) | Status | Notes |
|---|---|---|
| Built on Forge | ✅ | Forge app `531f3777-…`, Node 22 runtime, "Runs on Atlassian" eligible |
| Integrates with at least one Atlassian product or capability | ✅ | Jira, Confluence, Teamwork Graph, Rovo (agent and actions), Rovo MCP |
| Fits one category | ✅ | **Apps for Business Teams** (finance) |
| Installation link for judges | ✅ | Production deploy, distribution set to *Sharing with anyone*, Jira and Confluence. Link is in `submission.local.md` |
| Instructions for judges | ✅ | Section 4 below |
| Demo video under 5 minutes, public on YouTube | ⏳ **You** | Script in section 6 |
| Category and bonus prizes named, with materials | ✅ | Section 3 |
| Explanation of how it meets the tech requirement | ✅ | Section 5 |
| Full Devpost form submitted before **Dec 23, 2026, 1:30am IST** | ⏳ **You** | Aim for Dec 21 to leave a buffer |
| Redeploy production before submitting | ⏳ | `forge deploy -e production`. The link always installs the latest production deploy |

---

## 2. Devpost text

**Name:** Sopher

**Tagline:** Turn the engineering work in Jira into an audit-ready software capitalization schedule.

### Inspiration
Every software company has to split engineering cost into two buckets for its financial statements. Building new features on internal-use software is **capitalized** as an asset (ASC 350-40 / IAS 38). Research, bug fixes, maintenance and post-launch work are **expensed**. The split moves reported profit by millions.

In practice, finance teams estimate it by sending engineers a spreadsheet survey every quarter ("what % of your time went to new features?"). The answers are guesses, the evidence is thin, and auditors push back. Meanwhile Jira already records exactly what was built, when, by whom and for how long. Nobody turns that context into accounting.

### What it does
Sopher reads the work already tracked in Jira and produces the capitalization schedule a controller needs at quarter-end:

- **Classifies every time log, not every issue.** Each worklog is placed in its project's stage on the day it was logged:
  - preliminary (before the project was authorized): expensed
  - application development: capitalized
  - post-implementation (after release): expensed

  One story can therefore be partly capitalized and partly expensed, which is how the accounting standard actually works. Bugs, maintenance and spikes are always expensed.
- **Explains every decision.** Each issue shows its treatment, a confidence level and plain-language reasons. Anything ambiguous (no epic, no authorization date, an unusual issue type) goes into a **controller review queue** instead of being guessed.
- **Treats each epic as a software asset.** Each epic shows its stage, its authorization date (editable), its placed-in-service date, capitalized cost to date, straight-line amortization and net book value.
- **Dashboard:** capitalized vs. expensed, capitalization rate, amortization, net book value, a four-quarter trend, the asset table and the review queue.
- **Controller overrides** with a required reason, kept as an audit trail.
- **One-click quarter-end memo in Confluence:** summary, assets, review items, method and a sign-off table. Republishing updates the same page with a new version.
- **Teamwork Graph evidence:** pull requests, deployments and goals linked to each epic appear next to the numbers. An epic's first successful production deployment can serve as its placed-in-service date.
- **Rovo agent "Cap Analyst":** a set of reusable actions (`get-schedule`, `explain-classification`, `list-review-queue`, `draft-cap-memo`) that let finance ask questions in chat. The read actions are also exposed as an **MCP server**, so other agents and AI tools can pull the schedule.

### How we built it
- **Forge (Node 22, UI Kit)** with a Jira global page, issue panel and admin page, plus Rovo `rovo:agent`, `action` and `rovo:mcp` modules.
- **A pure classification engine** (`src/engine/`) with no platform calls, so every rule is deterministic, reproducible and unit-tested. It doesn't need an LLM to produce numbers an auditor can rely on.
- **Jira REST v3:** paginated JQL search, full worklogs, and walking from sub-task to story to epic. Epic metadata is stored as an issue property, so Jira's own permissions govern edits.
- **Teamwork Graph curated queries** (`requestTeamworkGraph`) for linked PRs, deployments and goals. Graph failures degrade gracefully and never break the schedule.
- **Confluence REST v2** for the memo, in storage format with all user text escaped.
- **Forge storage** for settings and overrides.
- **A demo-data loader** that writes a realistic payments team into any empty project. It shifts dates by whole quarters so the demo stays current, and it can resume after a failure without duplicating anything.

### Challenges we ran into
- Getting **per-worklog stage classification** and **amortization** right, including the month placed in service and estimates when no time is logged, and proving it with hand-checked test figures.
- A real Jira API returning an **empty body** on success, which crashed the seeder halfway. That's why the loader can now resume.
- Forge's **server-side agent prompt check** rejected our first prompt. We rewrote the agent to explain Sopher's results instead of giving accounting advice, which is also the right product stance.
- Teamwork Graph is in **preview**, and new apps can only use curated queries. We introspected the live schema to pick the exact fields.

### Accomplishments that we're proud of
- The same numbers everywhere: the dashboard, issue panel, Confluence memo and agent actions all come from one service. They agreed to the dollar in end-to-end checks on a real site.
- Every classification can be explained and overridden. Sopher is decision support, and the controller makes the final call.
- 23 automated tests, including a fake-Jira test that crashes the loader partway and checks that it resumes.

### What we learned
Context is what makes AI-era finance tooling trustworthy. Deterministic rules applied to rich Jira context, with links to the evidence, beat a model guessing at percentages.

### What's next
- Per-person loaded rates imported from HR or payroll, and team-level rate cards
- Automatic removal of account IDs when Atlassian reports an account closed (personal data handling)
- Pulling project authorization from approved Confluence specs or Atlassian Goals automatically
- An export to ERP or close tools over the MCP server, plus a Marketplace listing

### Built with
Atlassian Forge, Forge UI Kit, Jira REST API, Confluence REST API, Atlassian Teamwork Graph, Rovo agents and actions, Rovo MCP, Forge storage, Node.js, JavaScript

**Repo:** https://github.com/ArhaanDev24/sopher

---

## 3. Category and bonus prizes

**Category:** Apps for Business Teams. The category description names finance teams directly ("help colleagues in … finance … move faster"), and Sopher's users are controllers and technical accountants.

| Bonus prize | Enter? | What we have | Materials |
|---|---|---|---|
| Best Agents (Rovo) | Yes | `rovo:agent` "Cap Analyst" plus 4 reusable `action` modules (3 read, 1 create) | Manifest in the repo. Example prompts in section 4. ⚠️ Rovo chat wasn't available on our test sites, so the video can't show a live chat. Show the actions' output through the UI and logs instead, and say so honestly |
| Best app with Atlassian MCP | Yes | `rovo:mcp` "Sopher Capitalization" exposes get-schedule, explain-classification and list-review-queue at `mcp.atlassian.com/forge/<appId>` | Endpoint confirmed live (OAuth 401 challenge). Same caveat: an admin must activate Rovo and expose the tools |
| Best Teamwork Graph integration | Yes | Consumes the Teamwork Graph API (curated queries) for PRs, deployments and goals, with 4 `read:graph:*` scopes | Evidence column, issue panel section, production-deployment release signal |
| Best Marketplace published app | No | Not listed. A Marketplace submission would disable the installation link, which is mandatory | — |

---

## 4. Testing instructions (paste into Devpost)

1. **Install:** open the installation link as a **site admin**, choose your site, and install for **Jira** (and **Confluence** if you want the memo feature).
2. **Create a project:** a **company-managed Scrum** project with key `DEMO`. Check that time tracking is on (Jira settings → System → Time tracking).
3. **Load demo data:** go to **Jira settings → Apps → Sopher settings → Demo data**, enter `DEMO`, and click **Load demo data**. This creates 3 epics, 16 issues and 32 time logs (about 10 seconds).
4. **Dashboard:** open **Apps → Capitalization**. **2026-Q4** shows $12,540 capitalized, $4,940 expensed, 72%, and $823 amortization. **2026-Q3** shows $17,860 capitalized.
5. **Issue panel:** open **DEMO-4 "Payout API endpoints"** and click the **Capitalization** app button under the title. It should show **Split**, $5,130 capitalized, $570 expensed, and the reasons.
6. **Epic asset view:** open **DEMO-3 "Partner analytics portal"** and set **Authorized on** to `2026-10-01`. DEMO-18 moves from the review queue to capitalized. Click **Clear** to undo.
7. **Override:** on any issue, click **Override**, choose a treatment, give a reason, and save. It appears as audit evidence. Click **Remove override** to undo.
8. **Confluence memo:** in Sopher settings, set the memo space to a Confluence space key you can edit. On the dashboard, click **Publish memo**.
9. **Rovo (if your site has Rovo chat):** choose the **Cap Analyst** agent and ask:
   - "What did we capitalize in DEMO for 2026-Q4?"
   - "Why is DEMO-4 capitalized?"
   - "What needs controller review in DEMO?"
   - "Draft the 2026-Q4 capitalization memo for DEMO in space FIN"

The demo data is dated 2026. If you test in 2027, the loader shifts the dates forward by whole quarters, and the figures stay the same.

---

## 5. How Sopher meets the technical requirement (paste into Devpost)

Sopher is a Forge app ("Runs on Atlassian") with these modules and integrations:
- **Modules:** `jira:globalPage` (dashboard), `jira:issuePanel` (per-issue treatment and the epic asset view), `jira:adminPage` (settings and demo loader), `rovo:agent` (Cap Analyst), four `action` modules, `rovo:mcp`.
- **Jira:** reads issues and worklogs through REST v3, with JQL, pagination and the hierarchy, and stores epic metadata as issue properties.
- **Confluence:** creates and versions the quarter-end memo through REST v2.
- **Teamwork Graph:** reads linked pull requests, deployments and goals using curated queries with `read:graph:*` scopes, and uses production deployments as a release signal.
- **Rovo:** an agent plus reusable actions, also exposed through MCP.

All data stays on Atlassian infrastructure (no egress). There are no LLM costs: the numbers come from a deterministic, tested engine.

---

## 6. Demo video script (target 4:30, public on YouTube)

| Time | Show | Say |
|---|---|---|
| 0:00–0:30 | Title card, then a spreadsheet survey | "Every software company capitalizes development cost. Most do it with a quarterly survey that asks engineers to guess percentages. Auditors hate it. Jira already knows the answer." |
| 0:30–1:15 | Dashboard, Q3 then Q4 | Totals, capitalization rate, trend chart. "Every time log is classified by the project's stage on the day it was logged." Point at the review queue. |
| 1:15–2:00 | DEMO-4 issue panel | "Split: May hours before authorization are expensed, the rest is capitalized." Show the reasons and the Teamwork Graph evidence section. |
| 2:00–2:45 | DEMO-3 epic view | Set the authorization date, then show DEMO-18 leave the review queue and the numbers move. Clear it. "The controller decides, and Sopher records why." Do an override with a reason. |
| 2:45–3:30 | Publish memo, then the Confluence page | Summary, assets with evidence, review items, method, sign-off. Republish to show the version going up. |
| 3:30–4:10 | Manifest and code | `rovo:agent` and actions, `rovo:mcp`, Teamwork Graph queries and scopes. Run `npm test` (23 passing). Mention the MCP endpoint. |
| 4:10–4:30 | Closing | "Sopher: Jira context in, audit-ready capitalization out. For controllers, at every software company." |

**Recording tips:** use a 1080p screen recording, and zoom the browser to 110–125% so numbers are readable. Use sopher-dev, which has demo data and the FIN memo space ready. Upload as **Public** to YouTube.

---

## 7. Judging criteria: where Sopher stands

| Criterion | Strengths | Risk and mitigation |
|---|---|---|
| Technological implementation | Deterministic engine with 23 tests; real Jira, Confluence and Teamwork Graph integration; resumable loader; works on any project, not one hardcoded path | Rovo and MCP not demoable live. Show the modules and endpoint, and be upfront |
| Design | Native UI Kit, a consistent story across dashboard, panel, memo and agent, and reasons everywhere | The UI is functional rather than flashy. The video should focus on the workflow |
| Potential impact | A concrete user (controllers), a concrete pain (survey-based capitalization), and measurable output | Cite how common the survey practice is, without inventing statistics |
| Innovation | Per-worklog stage classification, epics as assets with amortization, deployments as a placed-in-service signal | — |
| Presentation | Script above, timed to 4:30 | Keep it under 5:00 and show the product working end to end |
