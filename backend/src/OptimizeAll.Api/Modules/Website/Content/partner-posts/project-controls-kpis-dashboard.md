---
slug: project-controls-kpis-dashboard
title: Project Controls KPIs: Building a One-Page Dashboard
description: Choose the project controls KPIs that matter: leading versus lagging measures, CPI and SPI, forecast accuracy, change-order rate and float on one page.
cluster: pci-ai
primaryKeyword: project controls KPIs
categories: project-controls
tags: project controls kpis, dashboard, cpi, spi, reporting, forecast accuracy
related: estimate-at-completion-formulas, earned-schedule-explained, project-controls-vs-project-management, critical-path-method-explained, ai-prompts-for-project-managers, what-is-pcl-ai-certification
publishedDaysAgo: 47
cover: project-controls
coverAlt: Dark blue cover with dashboard tiles and the words Project controls KPIs on one page
---
Most project dashboards fail in one of two ways. Either they show twenty-five measures, so the reader cannot tell which three matter, or they show a handful of colours that have been reassuringly green for six months before the project collapses. Choosing **project controls KPIs** well is about selecting the few measures that change a decision and presenting them so the reader can act in two minutes.

This guide explains the difference between leading and lagging indicators, proposes a set of measures for a one-page dashboard, gives an illustrative example with thresholds, and lists the vanity metrics to avoid.

## Start with the decisions, not the data

Before choosing any KPI, write down the decisions the dashboard must support. For a typical sponsor, they are few:

1. Do we need to intervene on cost, schedule or scope this month?
2. Is the forecast credible?
3. Are risks and changes under control?
4. Is there anything I must decide or approve?

Every KPI on the page should help answer one of these. If you cannot say which decision a measure supports, remove it. The roles and who owns each measure are discussed in our comparison of [project controls and project management](/blog/project-controls-vs-project-management).

## Leading versus lagging indicators

**Lagging indicators** report what has already happened: spend to date, milestones achieved, cost variance. They are accurate but late. **Leading indicators** point to what is likely to happen: float consumption, the age of open risks, the trend in change requests. They are less precise but early, which is when intervention costs least.

A balanced dashboard needs both. A page of lagging indicators tells the sponsor why the project failed; a page of leading indicators tells them where to look this week.

| Type | Examples | Typical use |
|---|---|---|
| Lagging | Cost variance, schedule variance, milestones achieved, actual spend | Confirming performance |
| Leading | Float erosion on critical and near-critical paths, open risks past their review date, change-request trend, resource availability | Prompting early action |
| Both | CPI and SPI trend over several periods | Indicates whether performance is stabilising |

## The core project controls KPIs

### Cost performance: CPI and the trend

The cost performance index (CPI = EV / AC) shows how much value is earned per unit spent. Show the current value and the trend over at least three periods, because a stable 0.92 and a falling 0.92 tell different stories. See [earned value management explained](/blog/earned-value-management-explained) for the definitions.

### Schedule performance: SPI and SPI(t)

SPI = EV / PV is a useful early signal but loses meaning as a project nears its end. Pair it with the time-based measures from [earned schedule explained](/blog/earned-schedule-explained), which keep working late in the project.

### Forecast at completion with a range

Show the estimate at completion as a range with the method stated, as set out in [estimate at completion formulas](/blog/estimate-at-completion-formulas). A single number invites false precision.

### Forecast accuracy

This measure checks whether your forecasts deserve belief. One simple definition: for each completed reporting period, compare the forecast with the final outcome and express the difference as a percentage of the final figure. Track the average absolute difference across periods or projects. A forecasting process that is consistently wrong in the same direction has a bias worth fixing, and one that is wrong in random directions has a data or method problem.

### Change-order rate

Count approved changes and their cumulative value as a share of the original budget, and show the trend. A high or accelerating change rate suggests scope was not defined well or governance is weak. A very low rate can also be a warning sign, if changes are being absorbed informally.

### Float and critical-path health

Show the total float on the critical and near-critical paths and the trend. Falling float is the schedule equivalent of burning through contingency. The mechanics are in [critical path method explained](/blog/critical-path-method-explained).

### Risk exposure

Show the number of top risks, how many are past their review date, how many have owners and actions, and the quantified exposure against remaining contingency.

### Contingency drawdown

Compare contingency used with the share of project complete. If 60% of contingency has gone with 30% of the work done, the dashboard should make that obvious.

## An illustrative dashboard

This example uses fictional figures for a project at month nine of a 15-month programme. It shows what fits on one page.

| KPI | Value | Trend | Threshold (green / amber / red) | Status |
|---|---|---|---|---|
| CPI | 0.94 | Stable over 3 periods | 0.95 or above / 0.90 to 0.94 / below 0.90 | Amber |
| SPI(t) | 0.88 | Falling | 0.95 or above / 0.90 to 0.94 / below 0.90 | Red |
| EAC range | 10.4 to 11.2 million vs 10.0 budget | Widening | Within 3% / 3 to 8% over / above 8% over | Red |
| Forecast accuracy (last 3 periods) | 2.1% average error | Improving | Under 3% / 3 to 6% / above 6% | Green |
| Change-order rate | 4.5% of budget | Rising | Under 3% / 3 to 6% / above 6% | Amber |
| Critical-path float | 0 days; near-critical path 6 days | Falling | Above 10 days / 1 to 10 / 0 or negative | Red |
| Risks past review date | 3 of 12 | Stable | 0 / 1 to 2 / 3 or more | Red |
| Contingency used vs work complete | 40% used, 55% complete | Stable | Used no more than complete / up to 10 points higher / more | Green |

How to read it: cost is slightly below target but stable; schedule is the concern, with falling time-based performance and no float; and the forecast range is widening. The right one-page message for a sponsor is not the table but the three lines below it:

1. Schedule is the main risk: SPI(t) is 0.88 and the critical path has no float.
2. The forecast range of 10.4 to 11.2 million exceeds the 10.0 budget in every case; options to recover time will be tabled next month.
3. Decision needed: approve an early order for long-lead items.

Thresholds are examples only. Set your own with the sponsor, in advance, so colours mean the same thing every month.

## Designing the page

- **Limit it to eight to ten measures.** More dilutes attention.
- **Put the decision request at the top.** What should the reader do?
- **Use trends, not only values.** A small sparkline or an arrow adds more than an extra number.
- **Define every KPI in a footnote or a data dictionary**: formula, source, owner, cut-off date. A single row is enough, for example: "CPI; EV / AC, cumulative to the data date; EV from the progress system using the agreed measurement rules, AC from the ledger including accruals; owner, controls lead; refreshed monthly." Without that row, two people will calculate the same KPI two different ways within a quarter.
- **Show the data date.** An undated dashboard is untrustworthy.
- **Colour should follow rules agreed in advance**, not judgement on the day, so that red cannot quietly become amber.

## A cadence that keeps the dashboard honest

A dashboard is only useful if it is produced on a predictable rhythm. A workable pattern is a fixed data cut-off, a short reconciliation of the numbers by the controls team, a brief review with the project manager to agree the narrative, and then distribution. The review step matters: it is where unexplained movements are questioned before the sponsor sees them. Keep the previous period's page alongside the new one, so that changes in status are visible and any threshold that was quietly altered can be spotted. Review the KPI set itself every quarter and retire any measure that has not influenced a decision.

## Vanity metrics to avoid

- **Percent complete without a basis.** An unmeasured number is an opinion.
- **Hours worked or tasks closed.** Activity is not progress.
- **Budget spent as a share of budget** with no link to work done. Spending 50% means little unless you know how much was earned.
- **Counts of risks without severity.** Fifty low risks and one critical one is not "51 risks".
- **Green status with no criteria.** If nobody can say what turns it amber, it is decoration.

## Where AI helps

AI can summarise a data pack into a first-draft narrative, check a table for inconsistencies and suggest wording for a decision request. Treat the numbers as the controls team's responsibility: recalculate figures that appear in a draft, and have a named person review and disclose AI assistance. For prompting guidance, see [AI prompts for project managers](/blog/ai-prompts-for-project-managers).

## Tools that help / Learn it properly

Earned value, forecasting and risk are among the areas [PCI AI](https://pciai.org) lists for its PCL-AI credential; see its published materials for the official detail, since the KPI set and thresholds here are our own suggestions. Our [PCI AI partner page](/partners/pci-ai) summarises the credentials, and Optimize All's free course [Project Controls with AI](/learn/project-controls-with-ai) covers reporting with governed AI. To place this skill in a wider syllabus, read the [PCL-AI certification guide](/blog/what-is-pcl-ai-certification).

## Frequently asked questions

### How many KPIs should a project dashboard have?

Eight to ten is a practical ceiling for a one-page view. Each one should support a specific decision.

### What is the most important KPI?

There is no single answer. If forced to choose, many practitioners would pick a credible forecast range, because it combines cost, schedule and risk into the question a sponsor actually asks.

### How do I set thresholds?

Agree them with the sponsor before the project starts, using past projects and contractual tolerances as a guide, and document them in the reporting plan.

### Should I automate the dashboard?

Automate data collection and calculation where you can, and keep a human review step before distribution. Automation spreads errors faster as well as saving time.

---

*Optimize All is the official marketing partner of PCI AI and Certuvo.*
