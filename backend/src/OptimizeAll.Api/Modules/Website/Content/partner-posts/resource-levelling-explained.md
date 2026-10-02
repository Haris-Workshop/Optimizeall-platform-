---
slug: resource-levelling-explained
title: Resource Levelling Explained with a Worked Example
description: Resource levelling vs resource smoothing explained, with a worked example, the effect on float and the critical path, and practical tips for planners.
cluster: pci-ai
primaryKeyword: resource levelling
categories: project-controls
tags: resource levelling, scheduling, resource loading, critical path, project controls
related: critical-path-method-explained, dcma-14-point-schedule-assessment, project-scheduling-software-guide, s-curve-project-management, ai-for-project-scheduling, how-to-build-a-cost-baseline
publishedDaysAgo: 69
cover: project-controls
coverAlt: Dark blue cover with horizontal schedule bars and the words Project controls and finance
---
A critical path schedule assumes that resources are unlimited. It tells you how quickly the work could be done if every crew, engineer and machine were available whenever the logic allowed. Real projects are not like that: you have two cranes, one commissioning team and a specialist welder who is shared with another job.

**Resource levelling** reconciles the schedule with those limits. It delays activities, within or beyond their float, so that demand for a resource never exceeds what is available. Done well, it turns a theoretical plan into one the team can actually execute. Done blindly — by pressing a "level" button and accepting the result — it can produce a schedule nobody understands. This guide explains how levelling works, how it differs from smoothing and how to do it deliberately.

## Resource loading comes first

Levelling needs resource-loaded activities: each activity has the resources it requires (for example two electricians for ten days). Summing those requirements by period produces a **resource histogram** — the demand profile over time. Comparing it with availability shows where the plan is overloaded.

Resource loading also supports cost: if resources carry rates, the loaded schedule produces a time-phased cost profile that can feed the [cost baseline](/blog/how-to-build-a-cost-baseline) and the planned value [S-curve](/blog/s-curve-project-management).

## Levelling vs smoothing

The two terms are often confused.

| | Resource levelling | Resource smoothing |
|---|---|---|
| Goal | Never exceed resource limits | Reduce peaks and troughs in demand |
| Can it move the finish date? | Yes, if needed | No — activities move only within their float |
| When used | Resources are genuinely constrained | Resources are available but a steadier profile is cheaper or easier to manage |
| Effect on critical path | Can create a new, resource-driven critical path | Critical path unchanged, but float is consumed |

Smoothing is the gentler tool. Levelling is the honest one when limits are real.

## A worked example

A small project has five activities. Logic: A precedes C; B precedes D; C and D both precede E. Each activity's duration and electrician requirement:

| Activity | Duration (days) | Electricians per day | Early start | Early finish | Total float |
|---|---|---|---|---|---|
| A | 4 | 2 | Day 1 | Day 4 | 0 |
| B | 3 | 2 | Day 1 | Day 3 | 3 |
| C | 5 | 2 | Day 5 | Day 9 | 0 |
| D | 3 | 2 | Day 4 | Day 6 | 3 |
| E | 2 | 1 | Day 10 | Day 11 | 0 |

The critical path is A–C–E, finishing on day 11. B and D have three days of float.

The company has **three electricians**. In the early-start schedule:

- Days 1–3: A and B both run, needing 4 electricians — over the limit by one.
- Day 4: A and D run, needing 4 — over the limit.
- Days 5–6: C and D run, needing 4 — over the limit.

### Option 1: smooth within float

B and D have three days of float. Delay B to start on day 4 (finish day 6) and D to start day 7 (finish day 9). Now:

- Days 1–3: A only (2 electricians).
- Day 4: A and B together need 4.
- Days 5–6: C and B together need 4.
- Days 7–9: C and D together need 4.

Smoothing alone cannot remove the overload, because B and D overlap with the critical activities wherever they go within their float.

### Option 2: level, allowing the finish to move

With only three electricians and each of A, B, C and D needing two, no two of those four activities can run at the same time, so levelling has to put them in series while respecting the logic. The sequence becomes, for example, A (days 1–4), B (days 5–7), C (days 8–12), D (days 13–15), E (days 16–17).

That is a big change: the finish moves from day 11 to day 17. But it is the truth. The planner now has evidence for a decision: hire a fourth electrician (allowing two activities in parallel and restoring the day-11 finish), split activities to use one electrician at a time, or accept the later date.

### What changed in the network

After levelling, float and the critical path are **resource-driven**, not purely logic-driven. Every activity in the levelled sequence is now critical, including B and D, even though nothing in the logic says B must precede C. If the team later adds an electrician, the levelled sequence should be removed and recalculated — otherwise the schedule keeps constraints that no longer exist.

## Levelling in scheduling tools

Most scheduling tools can level automatically. Typical settings control:

- **Priority rules** — which activity gets the resource first (for example least float, earliest start, or a priority code).
- **Level within float only** — effectively smoothing.
- **Split activities** — whether work can pause and resume.
- **Resources to level** — usually only the genuinely constrained ones.

Automatic levelling is a calculation, not a plan. Review the result: check which activities moved and why, whether the new sequence is practical on site, and whether key milestones moved. Our guide to [project scheduling software](/blog/project-scheduling-software-guide) compares the main tool categories.

## Practical tips

1. **Level only scarce resources.** Levelling every labour category produces noise. Pick the resources that genuinely constrain delivery.
2. **Keep levelling delays visible.** Use a levelling delay field or explicit resource-driven links with notes, not invisible constraints.
3. **Check schedule quality first.** Missing logic and hard constraints distort levelling. Run a [DCMA 14-point assessment](/blog/dcma-14-point-schedule-assessment) before levelling; our printable [schedule health check template (PDF)](/downloads/schedule-health-check-template.pdf) helps.
4. **Re-level after updates.** Progress changes the picture; a levelled sequence from three months ago may no longer be valid.
5. **Communicate the trade-off.** "We can finish on day 11 with four electricians or on day 17 with three" is a decision; "the tool moved the date" is not.

## Reading a resource histogram

Before touching any setting, look at the histogram for each constrained resource. Three shapes are common. A **single sharp peak** usually means several activities were planned in parallel for convenience and can be staggered with little effect on the finish. A **long plateau above the limit** means the plan needs more of the resource than you have for a sustained period, so either the finish moves or the resource is increased. A **saw-tooth** pattern of peaks and troughs suggests smoothing within float will pay off, because idle days between peaks can absorb work moved from the peaks.

## Levelling across several projects

In many organisations the scarcest resources — specialist engineers, commissioning teams, heavy equipment — are shared between projects. Levelling one schedule at a time then gives each project manager a plan that assumes the shared resource is theirs, and the conflicts only surface when two sites call for the same team in the same week.

A portfolio approach helps:

1. Keep the shared resources in a **common pool** with a single owner.
2. Agree **priority rules** between projects in advance, for example by contractual deadline or business value, so the levelling calculation reflects real decisions.
3. Run a **monthly resource review** that looks at demand across all schedules, not just one.
4. Feed the outcome back into each project's schedule as explicit, documented resource-driven links.

## Common levelling mistakes

- **Levelling an unstatused schedule.** If progress has not been updated, the levelled sequence reflects a plan that no longer exists.
- **Accepting the default priority rule.** The tool's default rarely matches project priorities. Choose the rule deliberately.
- **Letting levelling hide the critical path.** After levelling, check which activities drive the finish and why, and explain resource-driven criticality in the narrative.
- **Never removing old levelling delays.** When resources change, stale delays keep the schedule artificially long.

## Where AI helps

AI and optimisation tools can explore many levelling scenarios quickly — different priority rules, crew sizes and splitting options — and summarise the trade-offs. They are especially useful for multi-project resource pools where manual levelling is impractical. Our guide to [AI for project scheduling](/blog/ai-for-project-scheduling) covers what these tools do well and where they need oversight. Optimize All's free course [Project Controls with AI](/learn/project-controls-with-ai) includes resource levelling lessons and worked examples.

## Building the skill

Resource-constrained scheduling links planning, cost and risk — a combination at the core of the [PCI AI](https://pciai.org) PCL-AI Project Controls Leader credential. See our [PCI AI partner page](/partners/pci-ai) for an overview of the certifications.

## Frequently asked questions

### Does resource levelling always extend the project?

No. If enough float exists, levelling can resolve overloads without moving the finish. It extends the project only when limits cannot be met within float.

### Is resource levelling the same as crashing?

No. Crashing adds resources to shorten the schedule, usually at extra cost. Levelling works within resource limits and may lengthen the schedule.

### Should the baseline schedule be resource-levelled?

If resources are genuinely constrained, yes — a baseline that ignores real limits is not achievable. Record the levelling assumptions so they can be revisited.

### What is a resource-driven critical path?

It is a critical path created by resource limits rather than logic alone. After levelling, activities may be critical because they wait for a shared resource.

---

*Optimize All is the official marketing partner of PCI AI and Certuvo.*
