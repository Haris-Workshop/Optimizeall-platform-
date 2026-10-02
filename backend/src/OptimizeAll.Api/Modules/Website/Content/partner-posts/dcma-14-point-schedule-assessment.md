---
slug: dcma-14-point-schedule-assessment
title: DCMA 14-Point Assessment: A Schedule Health Check Guide
description: How to run the DCMA 14-point schedule assessment: each check, the usual thresholds, how to read failures and how to fix a schedule before it misleads.
cluster: pci-ai
primaryKeyword: DCMA 14-point assessment
categories: project-controls
tags: schedule quality, dcma, scheduling, critical path, project controls
related: critical-path-method-explained, schedule-risk-analysis-monte-carlo, resource-levelling-explained, delay-analysis-methods, project-scheduling-software-guide, what-is-project-controls
publishedDaysAgo: 6
cover: project-controls
coverAlt: Dark blue cover with horizontal schedule bars and the words Project controls and finance
---
A schedule can look professional and still be useless. It can have hundreds of activities, a tidy Gantt chart and a confident finish date, yet be built on missing logic, hard constraints and durations nobody can defend. When that happens, every number derived from it — critical path, float, planned value, the forecast finish — inherits the flaw.

The **DCMA 14-point assessment** is the best-known way to catch those flaws quickly. It was developed by the US Defense Contract Management Agency as a set of fourteen metrics for reviewing contractor schedules, and it has since become a common reference point well outside defence: planners in construction, energy, infrastructure and IT use it as a first-pass health check. This guide explains each check, the thresholds people usually apply, how to interpret a failure and how to turn the results into a better schedule.

A word of caution before we start. The thresholds below are the ones widely quoted for the DCMA assessment. Your contract, client or company may set different ones, and the checks are a screening tool, not a verdict. A schedule that passes all fourteen can still be wrong; one that fails a few may be perfectly sound for a good reason. Treat the results as questions to ask.

## Why a schedule health check matters

The schedule is the backbone of project controls. It drives the time-phased budget, so it drives planned value; planned value drives the schedule performance index; and the critical path drives every conversation about delay and acceleration. If you want to see how those pieces connect, our guide to the [critical path method](/blog/critical-path-method-explained) walks through forward and backward passes with a worked example.

Poor schedule quality shows up in predictable ways:

- **Float that is not real.** Missing successors make activities look as if they can slip indefinitely.
- **A critical path that is not driven by logic.** Hard constraints pin dates in place, so the "critical" path reflects the constraints rather than the work.
- **Forecasts that never move.** If remaining durations are not updated and logic is broken, the finish date stays put no matter what happens on site.
- **Risk analysis that is meaningless.** A Monte Carlo simulation run on a poorly linked schedule produces precise-looking nonsense. See our guide to [schedule risk analysis](/blog/schedule-risk-analysis-monte-carlo) for why logic quality comes first.

## The fourteen checks

Most checks are run on incomplete, normal activities (excluding milestones, summary bars and level-of-effort items). The percentages are usually expressed against that population.

| # | Check | What it looks for | Commonly quoted threshold |
|---|---|---|---|
| 1 | Logic | Activities missing a predecessor or a successor | No more than 5% |
| 2 | Leads | Relationships with negative lag | 0% |
| 3 | Lags | Relationships with positive lag | No more than 5% |
| 4 | Relationship types | Share of finish-to-start links | At least 90% FS |
| 5 | Hard constraints | Constraints that stop logic driving dates (for example must-start-on) | No more than 5% |
| 6 | High float | Total float above 44 working days | No more than 5% |
| 7 | Negative float | Activities with total float below zero | 0% |
| 8 | High duration | Remaining duration above 44 working days | No more than 5% |
| 9 | Invalid dates | Forecasts in the past or actuals in the future relative to the data date | 0% |
| 10 | Resources | Activities without resources or cost loading | Informational (no fixed threshold) |
| 11 | Missed tasks | Activities that should have finished by the data date but did not | No more than 5% |
| 12 | Critical path test | Whether adding delay to the critical path delays the finish by the same amount | Must pass |
| 13 | CPLI | Critical path length index: (critical path length + total float) ÷ critical path length | 0.95 or higher |
| 14 | BEI | Baseline execution index: tasks completed ÷ tasks that should have been completed | 0.95 or higher |

The 44-day figure in checks 6 and 8 corresponds roughly to two working months. It is a convention, not a law of physics: on a ten-year programme a handful of long-duration procurement activities may be entirely reasonable.

## Reading the results: what each failure usually means

### Logic, leads and lags (checks 1–3)

Missing logic is the most damaging failure, because it breaks the network that calculates float and the critical path. Every activity except the project start should have a predecessor, and every activity except the finish should have a successor. Open ends are often legitimate only at the very start and end of the schedule.

Leads (negative lags) make the network hard to follow and are often a symptom of activities that should be split. Long positive lags hide work: a 20-day lag between "pour slab" and "erect frame" might really be curing time, which is better shown as an activity so it can be statused.

### Relationship types and constraints (checks 4–5)

Finish-to-start relationships are the easiest to understand and status. A schedule full of start-to-start and finish-to-finish links is not wrong, but it is harder to review and easier to break. Hard constraints are a bigger concern: a "must finish on" date overrides logic, so if the work behind it slips, the schedule will show negative float or simply ignore the slip, depending on the tool and settings.

### Float and duration (checks 6–8)

High float usually means missing successors: an activity looks as though it can slip for months because nothing depends on it. Negative float means the schedule cannot meet a constraint or deadline as currently planned. That is valuable information — it should be reported, not hidden — but it must be explained with a recovery plan.

Long durations make progress hard to measure. Breaking a 90-day "install mechanical systems" activity into areas or systems gives you earlier warning and more honest earned value.

### Status quality (checks 9 and 11)

Invalid dates are a basic hygiene failure: actual dates after the data date, or forecast dates before it. Missed tasks show how well the team is executing against the baseline. A rising missed-task count is often the first sign that a programme's optimism is running out.

### The performance indices (checks 12–14)

The critical path test checks that the network actually responds to delay. CPLI tells you how realistic the remaining critical path is: a value below 1.0 means the team must work faster than planned on critical work to finish on time. BEI compares tasks completed with tasks that should have completed by now; read it alongside the [S-curve](/blog/s-curve-project-management) and earned value, not on its own.

## A practical workflow for running the assessment

1. **Freeze a copy.** Run the checks on a copy of the statused schedule at the data date, so the results are reproducible.
2. **Define the population.** Exclude completed activities, milestones, summary bars and level-of-effort items, and write down what you excluded.
3. **Run the checks.** Most scheduling tools can produce the counts with filters; many teams use an add-on or a script. Keep the raw lists, not just the percentages.
4. **Triage the failures.** For each failing check, sort the offending activities by float or by proximity to the critical path. Fix the ones that matter most first.
5. **Record justifications.** Some exceptions are legitimate. A long-lead equipment item may genuinely take 120 days; a contractual milestone may need a constraint. Document the reason so the next reviewer does not re-raise it.
6. **Re-run and compare.** Track the metrics month by month. Trends matter more than a single score.

To make step 5 easier, we have put the checks, thresholds and a justification column into a printable [schedule health check template (PDF)](/downloads/schedule-health-check-template.pdf) that you can use in review meetings.

All of our printable guides are collected on one page: [free project controls and exam prep PDF guides](/blog/free-project-controls-and-exam-prep-guides).

## A short worked example

A planner reviews a 1,200-activity schedule for a water treatment upgrade. After excluding milestones and level-of-effort items, 950 incomplete activities remain.

- 86 activities have no successor: 86 ÷ 950 = 9.1%, failing check 1.
- 31 activities carry hard constraints: 3.3%, passing check 5.
- 74 activities have total float above 44 days: 7.8%, failing check 6.

The failures are linked. When the planner sorts the 86 open-ended activities, 61 of them also appear in the high-float list: they are commissioning documentation tasks that were never tied to handover. Adding the missing successors removes most of the high-float failures and, more importantly, reveals a second near-critical path through documentation that nobody had been watching. That is the real value of the assessment — not the score, but the discovery.

## Where AI and automation help

Running the fourteen checks is mechanical, which makes it a good candidate for automation. Scripts can export the schedule, compute the metrics and produce the activity lists every month. AI assistants can go a step further: summarising which work areas generate most failures, drafting the narrative for the schedule review and suggesting likely missing successors based on activity names and codes.

Keep two guard-rails. First, an AI suggestion about logic is a hypothesis for the planner, not a change to apply automatically. Second, keep an audit trail of what was changed and why. Our guide to [AI in project controls](/blog/ai-in-project-controls) covers governance in more depth, and Optimize All's free course [Project Controls with AI](/learn/project-controls-with-ai) includes scheduling exercises and a module on governed AI.

## Building the skill

Schedule quality sits at the heart of project controls, and it features in the body of knowledge behind the [PCI AI](https://pciai.org) PCL-AI (Project Controls Leader) credential, which covers planning and scheduling alongside cost, earned value, forecasting and risk, with governed AI throughout. Our [PCI AI partner page](/partners/pci-ai) summarises the three PCI AI certifications, and the official site has the current body of knowledge and sample questions.

## Frequently asked questions

### Is the DCMA 14-point assessment mandatory?

Only where a contract or client requires it. Many organisations use it voluntarily as a baseline quality check because it is well known and easy to explain. Always check which thresholds your contract specifies.

### Can a schedule pass all fourteen checks and still be poor?

Yes. The checks test structure and status hygiene, not whether durations are realistic or the sequence reflects how the work will really be done. A walk-through with the people doing the work is still essential.

### How often should I run the assessment?

At baseline approval and then with every schedule update, usually monthly. Tracking the metrics over time shows whether schedule quality is improving or eroding.

### What should I fix first?

Missing logic. It distorts float, the critical path and every check that depends on them, so fixing it often clears several other failures at once.

---

*Optimize All is the official marketing partner of PCI AI and Certuvo.*
