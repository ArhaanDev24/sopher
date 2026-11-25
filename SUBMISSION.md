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
- **Close the quarter, then catch drift.** A controller closes the quarter and Sopher freezes the signed-off figures. From then on, anything that changes them in Jira (a back-dated time log, a late override, an issue moved to another epic) is flagged as a **post-close adjustment**, with before and after amounts per issue. It shows on the dashboard, in the memo and in the agent's answers. Auditors ask about exactly this, and no time-tracking report detects it.
- **Ask in Jira instead of surveying engineers.** Every review-queue item has a button that posts a targeted question as a Jira comment, where the person who can fix it will see it. Items with no epic are asked on the issue; work on an unapproved epic is asked on the epic. Each comment states the cost at stake ("$570 of work logged in 2026-Q4 can't be classified…"). Finance's question becomes work that moves forward inside Jira.
- **Operating income effect:** the number a CFO asks about. It shows how much higher profit is because development cost was capitalized (capitalized minus amortization: +$11,717 in the demo quarter).
- **One-click quarter-end memo in Confluence:** summary, assets, review items, method and a sign-off table. Republishing updates the same page with a new version.
- **Live figures on any Confluence page:** the *Sopher capitalization schedule* macro shows a project's quarter (totals, assets, evidence, close status) straight from Jira, so finance pages never carry stale pasted numbers.
- **Teamwork Graph evidence:** pull requests, deployments and goals linked to each epic appear next to the numbers. An epic's first successful production deployment can serve as its placed-in-service date.
- **Rovo agent "Cap Analyst":** a set of reusable actions (`get-schedule`, `explain-classification`, `list-review-queue`, `draft-cap-memo`) that let finance ask questions in chat. The read actions are also exposed as an **MCP server**, so other agents and AI tools can pull the schedule.

### How we built it
- **Forge (Node 22, UI Kit)** with a Jira global page, issue panel and admin page, plus Rovo `rovo:agent`, `action` and `rovo:mcp` modules.
- **A pure classification engine** (`src/engine/`) with no platform calls, so every rule is deterministic, reproducible and unit-tested. It doesn't need an LLM to produce numbers an auditor can rely on.
- **Jira REST v3:** paginated JQL search, full worklogs, and walking from sub-task to story to epic. Epic metadata is stored as an issue property, so Jira's own permissions govern edits.
- **Teamwork Graph curated queries** (`requestTeamworkGraph`) for linked PRs, deployments and goals. Graph failures degrade gracefully and never break the schedule.
- **Confluence REST v2** for the memo, in storage format with all user text escaped, and a `macro` module for live figures.
- **One source of truth across products.** Forge gives the Jira and Confluence installations separate storage, so after every controller action the Jira side publishes the project's state as a Jira project property. The macro and the Rovo/MCP actions read it with the user's own Jira permissions. Account IDs and personal pay rates never leave Jira's app storage.
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
- 41 automated tests, including a fake-Jira test that crashes the loader partway and checks that it resumes, and drift tests that replay a late override and a back-dated time log against a closed quarter.
- Every feature was verified end to end on a real Jira and Confluence site: closing Q4, adding a back-dated 2-hour log (flagged as +$190 on DEMO-14), posting a real "Ask in Jira" comment, and republishing the memo with its post-close adjustments.

### What we learned
Context is what makes AI-era finance tooling trustworthy. Deterministic rules applied to rich Jira context, with links to the evidence, beat a model guessing at percentages.

### What's next
- Per-person loaded rates imported from HR or payroll, and team-level rate cards
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
| Best Agents (Rovo) | Yes | `rovo:agent` "Cap Analyst" plus 4 reusable `action` modules (3 read, 1 create) | **Verified live in Rovo Chat** on the Codegeist demo site (one-atlas-dngv). It answered the Q4 schedule ($12,540 capitalized, 72%), explained an issue with Sopher's reasons, listed both review items, and drafted the Confluence memo through the CREATE action after Rovo's confirmation step. Show this in the video |
| Best app with Atlassian MCP | Yes | `rovo:mcp` "Sopher Capitalization" exposes get-schedule, explain-classification and list-review-queue at `mcp.atlassian.com/forge/<appId>`, plus an open-source **[skills/sopher/SKILL.md](skills/sopher/SKILL.md)** that teaches third-party agents to use them | **Verified live from Claude Code** on one-atlas-dngv: after signing in through Atlassian OAuth, Claude called Sopher's tools and answered the DEMO 2026-Q4 schedule. Setup: a site admin turns on **Connected apps → Sopher → View app details → Expose tools to MCP-compatible apps** (off by default) for each Sopher install, Jira and Confluence, then `claude mcp add --transport http sopher https://mcp.atlassian.com/forge/531f3777-ac41-4ef3-8c9c-5ba9aa764708`. Show this in the video |
| Best Teamwork Graph integration | Yes | Consumes the Teamwork Graph API (curated queries) for PRs, deployments and goals, with 4 `read:graph:*` scopes | **Verified live** on one-atlas-dngv: with GitHub for Atlassian connected to a demo repo, the Evidence column shows "2 PRs (2 merged) · 1 production deployment" for DEMO-1 and "2 PRs (0 merged)" for DEMO-2, read through `requestTeamworkGraph`. Also shown in the issue panel and memo, and used as a production-deployment release signal |
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
8. **Confluence memo:** in Sopher settings, set the memo space to a Confluence space key you can edit. On the dashboard, click **Publish memo**. Then, on any Confluence page, type `/Sopher`, insert **Sopher capitalization schedule**, and enter `DEMO` and `2026-Q4` to see the live figures. Closing the quarter in Jira shows as **Closed** on the page.
9. **Close and drift:** on the dashboard, click **Close 2026-Q4**. Then log 2 hours on **DEMO-14 "Velocity checks"** dated in November 2026 (or override any issue), and click **Refresh**. A **Changed since close** warning lists the issue with before and after amounts. Click **Reopen** to undo.
10. **Ask in Jira:** in **Needs controller review**, click **Ask on issue** next to DEMO-19 (or **Ask on epic** next to DEMO-18). A comment explaining what finance needs appears on that issue, and the row shows "Asked".
11. **Rovo (if your site has Rovo chat):** choose the **Cap Analyst** agent and ask:
   - "What did we capitalize in DEMO for 2026-Q4?"
   - "Why is DEMO-4 capitalized?"
   - "What needs controller review in DEMO?"
   - "Draft the 2026-Q4 capitalization memo for DEMO in space FIN"
12. **MCP (optional):** as a site admin, go to **admin.atlassian.com → your site → Connected apps → Sopher → View app details**, and under **Tools** click **Enable tools**. Do this for each Sopher install (Jira, and Confluence if installed). Then, in an MCP client such as Claude Code, run `claude mcp add --transport http sopher https://mcp.atlassian.com/forge/531f3777-ac41-4ef3-8c9c-5ba9aa764708`, sign in with your Atlassian account, choose your site, and ask "What did we capitalize in DEMO for 2026-Q4?". [skills/sopher/SKILL.md](skills/sopher/SKILL.md) teaches the agent how to use the tools.

The demo data is dated 2026. If you test in 2027, the loader shifts the dates forward by whole quarters, and the figures stay the same.

---

## 5. How Sopher meets the technical requirement (paste into Devpost)

Sopher is a Forge app ("Runs on Atlassian") with these modules and integrations:
- **Modules:** `jira:globalPage` (dashboard), `jira:issuePanel` (per-issue treatment and the epic asset view), `jira:adminPage` (settings and demo loader), `macro` (live figures in Confluence), `rovo:agent` (Cap Analyst), four `action` modules, `rovo:mcp`.
- **Jira:** reads issues and worklogs through REST v3, with JQL, pagination and the hierarchy, and stores epic metadata as issue properties.
- **Confluence:** creates and versions the quarter-end memo through REST v2, and embeds live figures in any page with a macro.
- **Teamwork Graph:** reads linked pull requests, deployments and goals using curated queries with `read:graph:*` scopes, and uses production deployments as a release signal.
- **Rovo:** an agent plus reusable actions, also exposed through MCP.

All data stays on Atlassian infrastructure (no egress). There are no LLM costs: the numbers come from a deterministic, tested engine.

---

## 6. Demo video script (target 4:30, public on YouTube)

| Time | Show | Say |
|---|---|---|
| 0:00–0:25 | Title card, then a spreadsheet survey | "Every software company capitalizes development cost. Most do it with a quarterly survey that asks engineers to guess percentages. Auditors hate it. Jira already knows the answer." |
| 0:25–1:05 | Dashboard, Q3 then Q4 | Totals, rate, trend chart, then **Operating income effect +$11,717**: "This is what capitalization does to profit this quarter." "Every time log is classified by the project's stage on the day it was logged." |
| 1:05–1:40 | DEMO-4 issue panel | "Split: May hours before authorization are expensed, the rest is capitalized." Show the reasons and the Teamwork Graph evidence. |
| 1:40–2:15 | DEMO-3 epic view | Set the authorization date, then show DEMO-18 leave the review queue and the numbers move. Clear it. "The controller decides, and Sopher records why." |
| 2:15–2:45 | Review queue, **Ask on issue** (DEMO-19), then the comment on the issue | "No survey. Finance asks in Jira, where the engineer works, with the dollars at stake." |
| 2:45–3:25 | **Close 2026-Q4**, log 2h on DEMO-14 dated November, then Refresh | The **Changed since close** warning: "$2,660 → $2,850. A back-dated time log after sign-off. Sopher catches it, so the auditor doesn't have to." Then Reopen. |
| 3:25–3:55 | Publish memo, then the Confluence page, then the "DEMO capitalization (live)" page | Summary with operating income, assets with evidence, review items, post-close adjustments (if closed), method, sign-off. Then the live macro: "The same numbers, live on any Confluence page." |
| 3:55–4:20 | Rovo Chat, then Claude Code over MCP | Open **Cap Analyst** in Rovo Chat and ask "What needs controller review in DEMO for 2026-Q4?". Then, in Claude Code connected to Sopher's MCP server, ask "What did we capitalize in DEMO for 2026-Q4?": "Same numbers, from any agent." Flash the manifest (`rovo:agent`, `rovo:mcp`) and SKILL.md. |
| 4:20–4:35 | Closing | "Sopher: Jira context in, audit-ready capitalization out. Close the quarter with confidence." |

**Recording tips:** use a 1080p screen recording, and zoom the browser to 110–125% so numbers are readable. Use the Codegeist demo site **one-atlas-dngv.atlassian.net**, which has Rovo Chat, demo data, the FIN memo space, and GitHub connected (private repo `payments-demo`, with PRs and a production deployment linked to DEMO issues) ready. Upload as **Public** to YouTube.

---

## 7. Judging criteria: where Sopher stands

| Criterion | Strengths | Risk and mitigation |
|---|---|---|
| Technological implementation | Deterministic engine with 41 tests; real Jira, Confluence and Teamwork Graph integration; resumable, deterministic loader; works on any project, not one hardcoded path; Rovo agent and MCP server verified live | MCP needs a site admin to enable tools (documented in step 12) |
| Design | Native UI Kit, a consistent story across dashboard, panel, memo and agent, and reasons everywhere | The UI is functional rather than flashy. The video should focus on the workflow |
| Potential impact | A concrete user (controllers), a concrete pain (survey-based capitalization and post-close surprises), and measurable output (operating income effect, adjustments caught) | Cite how common the survey practice is, without inventing statistics |
| Innovation | Per-worklog stage classification; epics as assets with amortization; deployments as a placed-in-service signal; quarter close with post-close drift detection; finance questions posted as Jira comments instead of surveys | — |
| Presentation | Script above, timed to 4:30 | Keep it under 5:00 and show the product working end to end |
