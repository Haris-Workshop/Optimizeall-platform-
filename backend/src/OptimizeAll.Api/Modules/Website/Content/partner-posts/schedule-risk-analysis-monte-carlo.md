---
slug: schedule-risk-analysis-monte-carlo
title: Schedule Risk Analysis: Reading P50 and P80 Dates
description: Schedule risk analysis explained in plain terms: three-point estimates, what P50 and P80 dates mean, how a simulation works and how to act on the result.
cluster: pci-ai
primaryKeyword: schedule risk analysis
categories: project-controls
tags: schedule risk analysis, monte carlo, p50, p80, risk, scheduling
related: critical-path-method-explained, earned-schedule-explained, estimate-at-completion-formulas, project-controls-kpis-dashboard, ai-governance-policy-for-project-teams, what-is-pcl-ai-certification
publishedDaysAgo: 45
cover: project-controls
coverAlt: Dark blue cover with a probability curve and the words Schedule risk analysis P50 and P80
---
A schedule that shows a single finish date makes a quiet promise it cannot keep: that every duration in the plan will turn out exactly as estimated. Nobody believes that, yet single-date schedules are still the norm in many steering committees. **Schedule risk analysis** replaces the single date with a distribution, and with it a more honest conversation: how likely is it that we finish by a given date, and what would it take to improve the odds?

This guide explains three-point estimates, what P50 and P80 mean, how a simulation works without the jargon, a worked example with illustrative numbers, and how to turn the output into decisions. It assumes you understand the logic of the [critical path method](/blog/critical-path-method-explained).

## Why schedule risk analysis beats a single date

Durations are estimates, and estimates are uncertain in a lopsided way. Work rarely finishes much earlier than planned, but it can finish much later. A task estimated at 10 weeks might take 8 in a good case and 16 in a bad one. When many such tasks sit on a path, the errors do not cancel out neatly, because the downside is larger than the upside.

The result is a well-known pattern: **the total built from most-likely durations is usually optimistic**. It is the sum of each task's single most probable outcome, which ignores the skew.

## Step 1: three-point estimates

For each task, ask the people who will do the work for three numbers:

- **Minimum:** the realistic best case (not a miracle).
- **Most likely:** the typical outcome.
- **Maximum:** the realistic worst case that is still plausible (not a catastrophe).

Gather them with care. People anchor on the plan, so ask for the extremes first and the most likely last, and record the reasoning behind each extreme. That reasoning also seeds the risk register.

## Step 2: how the simulation works

A Monte Carlo simulation is less mysterious than it sounds. In plain terms:

1. For every task, pick a random duration between its minimum and maximum, weighted so that values near the most likely are more probable.
2. Add the picked durations through the schedule logic, exactly as the critical path calculation would, and note the finish date.
3. Repeat thousands of times, each with new random picks.
4. Sort the finish dates and read off the percentiles.

No single run is a forecast. The value lies in the collection of runs, which shows the range of outcomes and how often each occurs.

## Step 3: reading P50 and P80

A **P-figure** (P50, P80 and so on) is a percentile: the confidence that the project finishes on or before that date. The term is unrelated to the p-value of statistical hypothesis testing, which confuses some readers.

- **P50** means a 50% chance of finishing on or before the date, and a 50% chance of finishing later. It is the median outcome. A commitment at P50 will be missed about half the time.
- **P80** means an 80% chance of finishing on or before the date. Many organisations use P80, or a similar level, for committed dates, because it leaves a reasonable margin. Which percentile to use is a policy choice, not a mathematical one.
- **P10 and P90** give a feel for the best and worst plausible outcomes.

### A worked example

This example uses illustrative figures. A small project has four tasks in sequence. Durations are in weeks.

| Task | Minimum | Most likely | Maximum |
|---|---|---|---|
| A: Design sign-off | 8 | 10 | 16 |
| B: Fabrication | 12 | 15 | 24 |
| C: Delivery | 6 | 8 | 14 |
| D: Installation | 10 | 12 | 18 |
| **Total** | **36** | **45** | **72** |

The deterministic plan simply adds the most-likely column: **45 weeks**. A simulation of about 50,000 runs of this model (triangular distributions, which is a common simple choice) would produce results close to these:

| Percentile | Finish (weeks) | Meaning |
|---|---|---|
| Plan, most-likely durations | 45 | About a 5% chance of finishing this early |
| P10 | 46 | Optimistic |
| P50 | 51 | Even odds |
| P80 | 54 | Four chances in five |
| P90 | 56 | Pessimistic but plausible |

Three observations follow:

1. **The plan sits at the optimistic end.** Roughly 5% of runs finish at 45 weeks or sooner. Presenting 45 weeks as the forecast would set the team up to miss it.
2. **P80 minus the plan gives a first estimate of schedule contingency.** Here, 54 - 45 = 9 weeks. That figure is based on stated uncertainty and can be justified, unlike a flat percentage.
3. **Any specific date has a probability.** If a contract requires completion in 52 weeks, the simulation would show roughly a 60% chance of meeting it. That number is far more useful to a sponsor than "we are on plan".

A note on the shape of the inputs. The triangular distribution gives the extremes more weight than most people intend, which is one reason some practitioners prefer a PERT-style distribution that concentrates more of the probability near the most likely value. With the same three points, a PERT shape would pull every percentile in the table a little closer to the plan. The choice matters less than the honesty of the three points, but state which shape you used so that two analyses can be compared.

## Step 4: act on the result

Analysis that does not change a decision is decoration. Four outputs deserve attention.

### Sensitivity: which tasks drive the uncertainty?

Most tools show how strongly each task's duration correlates with the project finish. In the example, fabrication has the widest range, so it contributes most of the spread. That tells you where to invest: an early supplier engagement or a second fabricator addresses the largest source of uncertainty.

### Criticality: how often is each path on the critical path?

When a schedule has parallel paths, an activity that is not critical in the deterministic plan may be critical in 30% of the runs. That is a **criticality index**, and it shows near-critical work that the simple critical path hides. Merging paths also push results later: when two paths join, the finish is governed by whichever is longer in each run, which creates what practitioners call merge bias.

### Mitigation testing

Change an input to reflect a mitigation, for example cutting fabrication's maximum from 24 to 20 weeks with a second supplier, and rerun the model. If P80 improves by two weeks, you can compare the benefit with the cost of the mitigation.

### Date setting

Use the output to set an internal target and an external commitment at different confidence levels. A common approach is to hold the team to a tighter date, such as P50, while committing externally at P80, with the gap managed by the sponsor as contingency.

## Where the numbers go wrong

- **Optimistic ranges.** If the maximum is not truly a bad-but-plausible case, results are too tight. Compare your ranges with outcomes on similar past projects.
- **Ignoring risk events.** Three-point estimates capture normal variation. Discrete risks, such as a permit refusal, need to be modelled separately with a probability and an impact.
- **Missing correlation.** If tasks share a driver, such as the same weather or the same supplier, they tend to run late together, and treating them as independent understates the spread.
- **Poor schedule logic.** The simulation inherits every logic flaw. Check the schedule's health first.
- **False precision.** A P80 of 54.3 weeks is not more accurate than 54. Report sensibly rounded dates and the assumptions beside them.

## Where AI helps and what to watch

AI tools can help draft the interview questions for estimators, summarise the reasoning behind ranges and prepare the narrative for a steering committee. They can also suggest ranges from historical data if the data is available and relevant. Treat such suggestions as inputs to a conversation, not as results. The estimators remain accountable for the ranges, and a named reviewer should sign off on the model and the narrative. Our guide to an [AI governance policy for project teams](/blog/ai-governance-policy-for-project-teams) sets out how to document that.

Compare the simulated outcome with other forecasts: [earned schedule](/blog/earned-schedule-explained) offers a performance-based view, and the principles of [estimate at completion](/blog/estimate-at-completion-formulas) apply to cost ranges in the same way.

## Tools that help / Learn it properly

Risk and forecasting are among the areas [PCI AI](https://pciai.org) lists for its PCL-AI credential; check its official materials for the authoritative detail, since the simulation approach described here is our own teaching choice. Our [PCI AI partner page](/partners/pci-ai) summarises the credentials, and Optimize All's free course [Project Controls with AI](/learn/project-controls-with-ai) includes practice on forecasting and risk. The [PCL-AI certification guide](/blog/what-is-pcl-ai-certification) shows where this topic sits in the wider syllabus.

## Frequently asked questions

### What is the difference between P50 and P80?

P50 is the date with a 50% chance of being met, and P80 is the date with an 80% chance. P80 is more cautious. Organisations choose which level to use for targets and for commitments.

### Do I need special software?

Specialist tools make it easier to link a simulation to a full schedule, but the idea can be demonstrated in a spreadsheet for a small network. The quality of the inputs matters more than the tool.

### How many simulation runs are enough?

Thousands of runs are typical, so that percentiles stabilise. Rerun with a different random seed; if P80 moves materially, increase the number of runs.

### Does schedule risk analysis replace the critical path method?

No. It builds on it. The deterministic critical path provides the logic, and the simulation adds uncertainty to it.

---

*Optimize All is the official marketing partner of PCI AI and Certuvo.*
