---
name: sopher-capitalization
description: Answer software capitalization questions (ASC 350-40 / IAS 38) from Jira data using the Sopher MCP server. Use when someone asks what was capitalized or expensed in a quarter, why a Jira issue was capitalized, what needs controller review, whether anything changed after a quarter was closed, or for a quarter-end capitalization memo.
---

# Sopher capitalization skill

Sopher is an Atlassian Forge app. It classifies engineering work tracked in Jira as **capitalized** or **expensed** under the internal-use software rules (ASC 350-40 / IAS 38), and amortizes each software asset (each Jira epic). This skill teaches an agent to use Sopher's MCP tools correctly.

## Connect

Sopher's tools are served by the Atlassian Rovo MCP server. A site admin has to install Sopher and then turn on its tools, which are off by default: **admin.atlassian.com → the site → Connected apps → Sopher → View app details → Tools → Enable tools**, for every product Sopher is installed on (Jira and Confluence). Until then, sign-in fails with "Your account isn't associated with a supported site", or the tools list fails with "not allowed to expose its tools over the external MCP endpoint". Then add the server to your MCP client, for example Claude Code:

```bash
claude mcp add --transport http sopher https://mcp.atlassian.com/forge/531f3777-ac41-4ef3-8c9c-5ba9aa764708
```

Sign in with your Atlassian account when prompted, and choose the site. Every call runs with that user's Jira permissions.

## Tools

| Tool | Use it for | Inputs |
|---|---|---|
| `get-schedule` | Totals for a project and quarter: capitalized, expensed, capitalization rate, amortization, net book value, operating income effect, the per-epic schedule, quarter close status, and post-close adjustments | `projectKey` (e.g. `DEMO`), `quarter` (e.g. `2026-Q4`, optional; defaults to the current quarter) |
| `explain-classification` | Why one issue was treated the way it was: stage, cost split, confidence, reasons, and Teamwork Graph evidence (PRs, deployments, goals). On an epic, it returns the software-asset view. | `issueKey` (e.g. `DEMO-4`) |
| `list-review-queue` | Issues a controller must decide on, with the reason for each | `projectKey`, `quarter` |

## How to answer

1. **Always call a tool before stating a number.** Never estimate, round differently, or invent amounts, dates or issue keys. Quote figures with their currency exactly as returned.
2. **Quarters are `YYYY-QN`.** If the user says "this quarter" and you know today's date, convert it. Otherwise ask.
3. **Explain with Sopher's reasons.** When asked "why", quote the `reasons` returned by `explain-classification`. The key idea: each time log is classified by its project stage on the day it was logged:
   - preliminary (before the project was authorized): expensed
   - application development: capitalized
   - post-implementation (after release): expensed

   Bugs, maintenance and spikes are always expensed.
4. **Flag estimates.** If `totals.estimatedCost` is above zero, say that part of the cost comes from original estimates, not logged time.
5. **Report post-close changes clearly.** If `get-schedule` returns `postCloseAdjustments`, the quarter was closed and figures changed afterwards. List each issue with its before → after amounts. Auditors care about these.
6. **Point to fixes for review items.** For each review-queue item, name the fix: link the issue to an epic, record the epic's authorization date in the Capitalization panel, or have a controller override the treatment with a reason.
7. **Decision support, not advice.** Sopher's output supports the controller, who makes the final call. Don't present it as accounting, tax or investment advice.

## Example

> **User:** How much did we capitalize in DEMO last quarter, and did anything change after close?
>
> **Agent:** *(calls `get-schedule` with projectKey `DEMO`, quarter `2026-Q4`)* In 2026-Q4, DEMO capitalized $12,540 and expensed $4,940 (72%). Amortization was $823, so operating income is $11,717 higher than if everything had been expensed. The quarter was closed on 2026-11-23. One change since then: DEMO-14 "Velocity checks" went from $2,660 to $2,850 capitalized, because of a time log added after close.
