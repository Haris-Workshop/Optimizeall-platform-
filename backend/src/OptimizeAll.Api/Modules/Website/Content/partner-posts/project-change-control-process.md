---
slug: project-change-control-process
title: Project Change Control: A Practical Process and Log
description: Set up project change control that works: a six-step process, a change log template, impact assessment, decision rights and a worked example.
cluster: pci-ai
primaryKeyword: project change control
categories: project-controls
tags: change control, scope management, baseline, governance, project controls
related: work-breakdown-structure-guide, how-to-build-a-cost-baseline, contingency-vs-management-reserve, delay-analysis-methods, project-controls-monthly-report, ai-governance-policy-for-project-teams
publishedDaysAgo: 65
cover: project-controls
coverAlt: Dark blue cover with horizontal schedule bars and the words Project controls and finance
---
Every project changes. Requirements are clarified, sites reveal surprises, clients have new ideas and suppliers deliver something slightly different from what was ordered. Change itself is not the problem. **Uncontrolled** change is: scope that grows without budget, schedules that slip without decisions and baselines that no longer describe the work.

**Project change control** is the process that turns a proposed change into a decision — with its impact on scope, cost, schedule and risk understood before anyone commits. This guide sets out a practical six-step process, a change log you can copy, decision rights that keep things moving and a worked example.

## What change control protects

Change control protects the **baselines**: the approved scope (the [work breakdown structure](/blog/work-breakdown-structure-guide) and its dictionary), the schedule baseline and the [cost baseline](/blog/how-to-build-a-cost-baseline). Performance is measured against these. If they change informally, variance analysis becomes meaningless — you cannot tell whether a project is over budget because of poor performance or because it is doing more work than it was asked to.

It also protects people. A clear process means a site manager does not have to decide alone whether to absorb a client's "small request", and a sponsor is not surprised by a cost increase that was effectively agreed months ago in a corridor.

## The six-step process

### 1. Raise

Anyone can raise a change request. It should state what is proposed, why, who requested it and what happens if nothing is done. Keep the form short; a long form discourages people from using it and pushes change underground.

### 2. Log

Every request gets an ID and goes into the change log, even if it is later rejected. The log is the single source of truth for what has been asked for and decided.

### 3. Assess impact

The controls team, with the relevant owners, assesses impact on:

- **scope** — which WBS elements are affected;
- **cost** — direct cost, indirect cost, and any effect on contingency;
- **schedule** — using the schedule model, not a guess, especially if the change touches the critical path;
- **risk** — new risks introduced or existing ones changed;
- **quality, safety and contracts** — specifications, permits, warranties and notification obligations.

For schedule impact, a fragnet (a small network of new activities inserted into the current schedule) is the most defensible approach; it is the same technique used in time impact analysis, discussed in our guide to [delay analysis methods](/blog/delay-analysis-methods).

### 4. Decide

The right person decides, based on the size and type of impact (see decision rights below). The options are approve, reject, defer or approve with conditions. Every decision is recorded with a date and a name.

### 5. Implement

Approved changes update the baselines: the WBS dictionary, schedule, budget and, if needed, the risk register. Contingency or management reserve drawdowns are recorded against the change. Our guide to [contingency vs management reserve](/blog/contingency-vs-management-reserve) explains which pot pays for what — and why neither should fund new scope.

### 6. Close and communicate

Tell the people affected, close the log entry and reflect the change in the next [monthly controls report](/blog/project-controls-monthly-report).

## Decision rights: keep small changes fast

A common failure is routing every change to the same board, which then meets monthly and becomes a bottleneck. Tiered decision rights fix this:

| Impact | Typical approver |
|---|---|
| No cost or schedule impact beyond a defined threshold, within one control account | Control account manager |
| Within the project's contingency and without moving key milestones | Project manager |
| Exceeds contingency, moves a key milestone or changes the business case | Change board or sponsor |
| Changes contract price or dates | As defined in the contract (often client and contractor jointly) |

Set the thresholds in your project's control procedures and review them if the board is flooded or, conversely, never sees anything.

## A change log template

| Field | Example |
|---|---|
| ID | CR-027 |
| Title | Add second data room to Level 4 |
| Raised by / date | Client facilities lead, 3 March |
| Description and reason | Client requires redundancy for new trading system |
| WBS elements affected | 1.3.2, 1.4.1 |
| Cost impact | +46,000 |
| Schedule impact | +8 working days to Level 4 completion; not on critical path |
| Risk impact | New risk: long-lead cooling unit |
| Funding source | Client variation |
| Decision / by / date | Approved with conditions, sponsor, 10 March |
| Baseline updated | Yes, 12 March |
| Status | Closed |

Keep the log sortable by status and age. A queue of unassessed changes is itself a risk: work may be proceeding on assumptions that have not been approved.

## A worked example

On an office fit-out, the client asks for a second data room on Level 4. The site team's first instinct is to "just do it" because the electrician is on site.

The controls lead logs CR-027 and builds a fragnet: additional cabling, a cooling unit with a six-week lead time, and extra testing. Inserting it into the current schedule shows that the cooling unit pushes Level 4 completion by eight working days, but Level 4 has eleven days of float, so the overall handover date is not affected. Cost is 46,000, beyond the project manager's authority, so the change goes to the sponsor, who approves it as a client variation with a condition: the cooling unit must be ordered within a week.

Without the process, the work might still have happened — but the cost would have been absorbed, the long-lead item would have surprised everyone, and the client might later have disputed paying for it.

## Common failure patterns

- **Verbal approvals.** If it is not in the log, it did not happen.
- **Impact assessed after the work starts.** By then the decision is no longer real.
- **Cumulative small changes.** Twenty changes each below the threshold can add up to a large one. Review cumulative impact monthly.
- **Re-baselining to hide variances.** Baselines change for approved changes, not to erase poor performance.
- **No link to the contract.** Many contracts require formal notices within set periods. Missing them can forfeit entitlement.

## Change control in contracts

When a contract is involved, internal change control must line up with the contract's own change mechanism. Most standard forms define who can instruct a change, how it is valued, what notices are required and within what time. The internal log should record the contractual reference for every change that affects price or dates, and the controls team should know the notice periods well enough to flag them before they expire. Treat the contract as the outer boundary of your process, not as a separate system run by the commercial team alone.

## Measuring whether change control is working

A few simple metrics, reviewed monthly, show whether the process is healthy:

- **Average time from raise to decision.** If it creeps up, work is probably proceeding on unapproved assumptions.
- **Number of open requests by age.** A long tail of requests older than a month deserves attention at the next project review.
- **Approved changes as a share of the original budget.** Rising cumulative change can signal unstable requirements or an incomplete original scope.
- **Changes raised after the work was done.** These retrospective requests indicate that the process is being bypassed on site.
- **Contingency drawdowns without a change or risk reference.** Every movement of money should be traceable.

None of these needs special software; a well-kept change log in a spreadsheet produces all of them. What matters is that someone looks at them and acts.

## Where AI helps

AI assistants can draft change request summaries from emails or meeting notes, check that log entries are complete, group similar requests and flag changes that may touch the critical path or contractual notice periods. They are also useful for spotting "scope creep by stealth" — recurring themes in site diaries that never became change requests. Decisions stay with the accountable people, and AI-assisted assessments should be labelled as such; our [AI governance policy guide](/blog/ai-governance-policy-for-project-teams) shows how to write that into team rules. Optimize All's free course [Project Management Leadership with AI](/learn/project-management-leadership-with-ai) covers governance, change control and decision rights in depth.

## Building the skill

Change control connects scope, schedule, cost and governance — the integrated picture tested by PCI AI's credentials. The [PCI AI](https://pciai.org) PCL-AI and PML-AI certifications both cover governance and control; see our [PCI AI partner page](/partners/pci-ai) for an overview and the official site for current details.

## Frequently asked questions

### What is the difference between change control and configuration management?

Change control decides whether a change should happen and updates the project baselines. Configuration management tracks the versions and characteristics of the product itself — drawings, specifications, software builds. They work together.

### Does every change need a change board?

No. Tiered decision rights let small, contained changes be approved quickly by control account managers or the project manager, reserving the board for significant impacts.

### How should agile projects handle change?

Agile teams expect change within an iteration's backlog, so routine reprioritisation does not need formal control. Changes to the overall budget, release dates or product vision still need a decision by the right people.

### Should rejected changes stay in the log?

Yes. Rejected and deferred requests show what was considered and why, which helps in disputes and lessons learned.

---

*Optimize All is the official marketing partner of PCI AI and Certuvo.*
