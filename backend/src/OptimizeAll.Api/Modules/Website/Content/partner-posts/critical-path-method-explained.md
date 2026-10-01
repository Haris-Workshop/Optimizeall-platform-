---
slug: critical-path-method-explained
title: Critical Path Method Explained With a Six-Activity Example
description: The critical path method explained step by step: networks, forward and backward pass, total and free float, common errors and schedule health checks.
cluster: pci-ai
primaryKeyword: critical path method
categories: project-controls
tags: critical path method, scheduling, float, planning, schedule health
related: what-is-project-controls, earned-schedule-explained, schedule-risk-analysis-monte-carlo, project-controls-kpis-dashboard, what-is-pcl-ai-certification, how-to-prepare-for-pci-ai-exams
publishedDaysAgo: 43
cover: project-controls
coverAlt: Dark blue cover with a network of linked schedule activities and the words Critical path method
---
Every scheduling tool on the market calculates a critical path in a fraction of a second, which makes it tempting to treat the method as a black box. That is risky. A schedule is only as reliable as its logic, and a planner who cannot reproduce the calculation by hand will struggle to spot when the software, or a colleague, has produced something misleading.

This guide explains the **critical path method** (CPM) through one small network of six activities that you can work with a pencil, then covers total and free float, common scheduling errors and a short set of schedule health checks.

## What the critical path method does

CPM takes three inputs for each activity: a duration, its predecessors and the type of relationship between them. From those it calculates:

- the earliest and latest times each activity can start and finish without delaying the project;
- the **float**, meaning how much an activity can slip;
- the **critical path**, the longest chain of dependent activities, which determines the earliest possible project finish.

Activities on the critical path have zero total float. Delay any one of them, and the project finish moves by the same amount, unless something else changes.

## The six-activity network

This example is illustrative. Durations are in days, and all relationships are finish-to-start: an activity can start when all its predecessors have finished.

| Activity | Description | Duration | Predecessors |
|---|---|---|---|
| A | Site mobilisation | 3 | none |
| B | Foundations | 4 | A |
| C | Procure equipment | 2 | A |
| D | Structure | 5 | B |
| E | Install equipment | 3 | C |
| F | Commissioning | 2 | D, E |

Two chains run from A to F: A, B, D, F and A, C, E, F.

## Step 1: the forward pass

The forward pass finds the earliest start (ES) and earliest finish (EF) of each activity. Start at day 0. EF = ES + duration. An activity's ES is the largest EF among its predecessors.

| Activity | ES | Duration | EF |
|---|---|---|---|
| A | 0 | 3 | 3 |
| B | 3 | 4 | 7 |
| C | 3 | 2 | 5 |
| D | 7 | 5 | 12 |
| E | 5 | 3 | 8 |
| F | 12 (larger of 12 and 8) | 2 | 14 |

The earliest project finish is **day 14**. Activity F cannot start before day 12, because it must wait for D, the later of its two predecessors.

## Step 2: the backward pass

The backward pass finds the latest finish (LF) and latest start (LS) that avoid delaying the project. Start at F with LF equal to the project finish, 14. LS = LF - duration. An activity's LF is the smallest LS among its successors.

| Activity | LF | Duration | LS |
|---|---|---|---|
| F | 14 | 2 | 12 |
| D | 12 | 5 | 7 |
| E | 12 | 3 | 9 |
| B | 7 | 4 | 3 |
| C | 9 | 2 | 7 |
| A | 3 (smaller of 3 and 7) | 3 | 0 |

## Step 3: float and the critical path

**Total float = LS - ES** (equivalently LF - EF).

| Activity | ES | LS | Total float |
|---|---|---|---|
| A | 0 | 0 | 0 |
| B | 3 | 3 | 0 |
| C | 3 | 7 | 4 |
| D | 7 | 7 | 0 |
| E | 5 | 9 | 4 |
| F | 12 | 12 | 0 |

The critical path is the chain with zero total float: **A, B, D, F**, with a length of 3 + 4 + 5 + 2 = 14 days. The equipment chain, C and E, has 4 days of float.

## Total float versus free float

The float on C and E is the same four days, and it is easy to overspend it by counting twice. This is where **free float** matters.

- **Total float** is how long an activity can slip without delaying the project finish. It is shared along a chain.
- **Free float** is how long an activity can slip without delaying the earliest start of any successor.

Calculate free float as the earliest start of the successor minus the activity's own earliest finish.

| Activity | Successor ES | Own EF | Free float |
|---|---|---|---|
| C | E starts at 5 | 5 | 0 |
| E | F starts at 12 | 8 | 4 |

If C slips by three days, it uses three of its four days of total float, but it also pushes E's earliest start back by three days, so E's own float and flexibility shrink. The 4 days belong to the chain, not to each activity. If both C and E each took four days, the project would finish 4 days late, not on time. Planners who report float per activity without noting this shared character can unintentionally authorise a delay.

## What the critical path tells you about decisions

- **To shorten the project**, you must shorten something on the critical path. Adding resources to C or E would cost money and change nothing.
- **To protect the finish date**, monitor critical activities most closely, and watch near-critical ones too. If the equipment chain grew from 5 days (C plus E) to 9, both paths would total 14 days and the project would have two critical paths; any growth beyond that would make the equipment chain the sole driver.
- **To release resources**, use float, carefully, on non-critical work, remembering that it is shared along the chain.

Near-critical paths matter more in practice than the textbook suggests, because durations are uncertain. Our guide to [schedule risk analysis](/blog/schedule-risk-analysis-monte-carlo) shows how to quantify that.

### What happens when a required date is imposed

Suppose the client requires commissioning to finish by day 12 rather than day 14. Run the backward pass again starting from LF = 12 for activity F. Every latest date on the critical path moves two days earlier, so A, B, D and F each show a total float of -2, while C and E drop from 4 to 2. Negative float does not mean the work can be done faster; it means the logic, as drawn, cannot meet the date, and the shortfall is exactly the amount by which the critical path must be compressed. Reporting that figure is far more useful than reporting that the project is "red".

## Common scheduling errors

1. **Missing predecessors.** An activity with no predecessor, other than the start, floats freely and can look as if it has endless float.
2. **Missing successors.** An activity with no successor, other than the finish, has no influence on the end date, which is rarely true.
3. **Constraints used as logic.** "Must start on" dates override the logic and can hide critical paths. Use them sparingly and document why.
4. **Excessive lags.** Lags embed hidden duration. Replace them with explicit activities where possible.
5. **Very long activities.** Durations much longer than the reporting period make progress hard to measure and mask slippage.
6. **Calendars that disagree.** An activity on a five-day calendar feeding one on a seven-day calendar creates surprising floats.
7. **Out-of-sequence progress.** Work started before predecessors finish needs a deliberate scheduling option, not an unexplained result.

## A short schedule health check

Before trusting any critical path, run through a quick list:

| Check | What to look for |
|---|---|
| Logic completeness | Every activity has a predecessor and a successor (apart from start and finish) |
| Float | Few activities with very large float, and few with negative float |
| Constraints | Count of hard constraints, each justified |
| Relationship types | Mostly finish-to-start; lags and leads limited |
| Durations | Few long activities relative to the reporting period |
| Progress | Actual dates consistent with the status date |
| Critical path | One continuous path from status date to finish, and it makes sense to the team |

Many scheduling tools offer automated schedule quality checks. They are valuable screening tools, but a passing score does not prove the logic is right. Always ask the team whether the critical path matches their understanding of how the work really flows.

## Where AI fits

AI tools can summarise a schedule's health checks, draft a narrative about the critical path or help translate a work breakdown into activities. They should not be trusted to write or alter schedule logic unreviewed. A scheduler should recalculate any critical path claim independently and keep the source schedule under change control. Our guide to [earned schedule](/blog/earned-schedule-explained) shows a complementary top-down view that is useful as a cross-check.

## Tools that help / Learn it properly

Planning and scheduling are among the areas [PCI AI](https://pciai.org) lists for its PCL-AI credential; read its official body of knowledge for the authoritative list, since the choice to teach them through critical path and float is ours. For practice, Optimize All's free course [Project Controls with AI](/learn/project-controls-with-ai) includes network exercises, and our [PCI AI partner page](/partners/pci-ai) summarises the credentials. The [PCL-AI certification guide](/blog/what-is-pcl-ai-certification) and the [PCI AI exam preparation plan](/blog/how-to-prepare-for-pci-ai-exams) show how scheduling fits the wider syllabus.

## Frequently asked questions

### Can a project have more than one critical path?

Yes. If two chains of activities both have zero total float, both are critical. Projects with multiple near-critical paths carry more schedule risk, because any of them can become the driver.

### What does negative float mean?

The schedule, as logic stands, cannot meet a required date or constraint. It signals that a target is unachievable without changing logic, durations, resources or the date.

### Is the critical path the same as the activities with the most risk?

No. The critical path is about timing logic, not risk. A non-critical activity with large uncertainty can become critical, which is why risk analysis complements CPM.

### Do I need to calculate a critical path by hand?

Rarely at work, but doing it a few times builds the intuition to spot errors in software output, and scenario-based exams reward that understanding.

---

*Optimize All is the official marketing partner of PCI AI and Certuvo.*
