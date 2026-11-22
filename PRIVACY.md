# Sopher privacy policy

*Last updated: November 22, 2026*

Sopher is a Jira and Confluence app built on Atlassian Forge. It turns engineering work tracked in Jira into a software capitalization schedule. This policy explains what data Sopher uses and where that data lives.

## Where Sopher runs

Sopher runs entirely on Atlassian's Forge platform ("Runs on Atlassian"). It makes no calls to servers outside Atlassian, and the developer runs no servers of their own. All data stays inside your Atlassian cloud site and Atlassian's Forge infrastructure.

## Data Sopher reads

To build the schedule, Sopher reads the following through Atlassian's APIs, using the permissions of the person viewing it:

- Jira issues in the projects you choose to track: summary, issue type, labels, parent, dates, original estimate, assignee, fix versions
- Worklogs on those issues: author account ID and name, start time, time spent
- Confluence spaces, to publish the quarterly memo when you ask for it

Sopher works this data out on demand and does not keep a copy.

## Data Sopher stores

| What | Where | Why |
|---|---|---|
| App settings: tracked project keys, hourly rates, useful life, currency, default Confluence space | Forge storage on your site | Configuration |
| Controller overrides: issue key, chosen treatment, reason, time, **and the Atlassian account ID and display name of the person who made the override** | Forge storage on your site | Audit trail for capitalization decisions |
| Epic metadata: project authorization date, release date (issue property `sopher` on the epic) | Your Jira site | Determines the project stage |
| Demo data, only if an admin clicks "Load demo data": sample issues and worklogs labelled `sopher-demo` | Your Jira site | Lets you try the app |
| Memo pages, only when someone publishes a memo | Your Confluence space | Quarter-end documentation |

Sopher stores no other personal data. It has no tracking or advertising, and it doesn't sell or share data with anyone.

## Logs

Forge logs record which Rovo action ran, with its inputs (project key, quarter, issue key) and whether it succeeded. Logs contain no financial figures. Atlassian keeps Forge logs according to its own retention policy. They're visible to the app developer only if your site admin allows log sharing.

## Deleting data

- **Uninstalling Sopher** deletes its Forge storage (settings and overrides).
- Epic metadata, demo issues and memo pages are ordinary Jira and Confluence content. Delete them in Jira or Confluence like any other content.
- To have an account ID removed from override records before uninstalling, open an issue (link below). Automatic removal when Atlassian reports a closed account is planned.

## Contact

Questions or requests: https://github.com/ArhaanDev24/sopher/issues
