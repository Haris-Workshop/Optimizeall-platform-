---
slug: s-curve-project-management
title: The S-Curve in Project Management: How to Read It
description: What the S-curve in project management shows, how to build planned, earned and actual curves, and how to read gaps, slopes and forecasts correctly.
cluster: pci-ai
primaryKeyword: S-curve in project management
categories: project-controls
tags: s-curve, earned value, reporting, forecasting, project controls
related: how-to-build-a-cost-baseline, earned-value-management-explained, progress-measurement-methods, project-controls-monthly-report, earned-schedule-explained, project-cash-flow-forecasting
publishedDaysAgo: 71
cover: project-controls
coverAlt: Dark blue cover with horizontal schedule bars and the words Project controls and finance
---
If you have sat through a project review, you have almost certainly seen an S-curve: a line that starts flat, climbs steeply through the middle of the project and flattens again towards the end. It is one of the most common charts in project controls, and one of the most commonly misread.

This guide explains what the **S-curve in project management** actually shows, why projects follow that shape, how to build the three curves that matter (planned, earned and actual), and how to read the gaps between them without falling into the usual traps.

## Why the curve is S-shaped

Plot cumulative cost, hours or progress against time, and most projects produce an S. The reason is simple:

- **Start-up.** Early work is design, mobilisation and procurement. Spending and progress are slow.
- **Peak production.** Construction, build or main delivery runs in parallel across many work fronts. The curve is steepest here.
- **Close-out.** Commissioning, snagging and documentation involve fewer people and less spend. The curve flattens.

The period-by-period view (spend per month) is a hump; its running total is the S. Both are useful: the hump shows the resource peak, the S shows cumulative position.

## The three curves that matter

A single S-curve tells you little. The value comes from comparing curves built on the same basis:

| Curve | What it shows | Earned value term |
|---|---|---|
| Planned | Cumulative budget for work scheduled by each date | Planned value (PV) |
| Earned | Cumulative budget for work actually completed | Earned value (EV) |
| Actual | Cumulative cost actually incurred | Actual cost (AC) |

The planned curve comes from the time-phased [cost baseline](/blog/how-to-build-a-cost-baseline). The earned curve depends on credible progress measurement — see our guide to [progress measurement methods](/blog/progress-measurement-methods). The actual curve comes from the cost ledger, including accruals for work done but not yet invoiced.

Some teams draw S-curves in hours or physical quantities instead of currency. That works well for labour-driven progress, as long as all three curves use the same unit.

## Reading the gaps

At any date, the vertical gaps between the curves tell you the variances:

- **Earned below planned** — behind schedule in value terms (schedule variance is negative).
- **Actual above earned** — spending more than the value of work achieved (cost variance is negative).

The **horizontal** gap between earned and planned is also meaningful: it shows how far behind schedule you are in time. If the value you have earned today was planned to be earned six weeks ago, you are roughly six weeks behind on that measure. That idea is the foundation of [earned schedule](/blog/earned-schedule-explained), which gives a more reliable time-based measure than SPI late in a project.

## A worked example

A 12-month infrastructure package has a budget at completion of 6.0 million. At the end of month 6:

```
Planned value (PV)  = 3.1m
Earned value (EV)   = 2.7m
Actual cost (AC)    = 3.0m
```

The vertical gaps:

```
SV  = EV - PV = 2.7 - 3.1 = -0.4m   (behind schedule)
CV  = EV - AC = 2.7 - 3.0 = -0.3m   (over cost)
SPI = 2.7 / 3.1 = 0.87
CPI = 2.7 / 3.0 = 0.90
```

Looking at the planned curve, 2.7 million was planned to be earned during month 5. So the horizontal gap is roughly one month: the package is about a month behind.

The shape tells you more than the numbers. If the earned curve has been running parallel to the planned curve one month behind since month 3, the team has a consistent lag — perhaps a late start that was never recovered. If the gap has widened every month, productivity is falling and the problem is getting worse. The same variance at month 6 can mean very different things depending on the trend.

## Forecasting with the S-curve

An S-curve is also a forecasting tool. Extend the earned curve forward using a realistic production rate and add a forecast actual-cost curve using the current CPI or a bottom-up estimate. The point where the forecast earned curve reaches the budget at completion indicates the forecast finish; the forecast actual curve at that point is the estimate at completion. Our guide to [estimate at completion formulas](/blog/estimate-at-completion-formulas) explains the options.

A useful check is the **slope required to finish on time**. If the team has achieved 0.45 million per month so far and must achieve 0.55 million per month for the remaining six months to meet the finish date (3.3 million of remaining work ÷ 6), the curve tells you immediately that recovery requires a step change — which the narrative must explain.

## Common traps

### A planned curve that does not match the schedule

If the baseline was spread evenly rather than following the schedule, the planned curve will not be S-shaped and every variance will be distorted. Build the planned curve from the resource-loaded or cost-loaded schedule.

### Comparing percent spent with percent complete

A project that has spent 50% of its budget is not 50% complete. The actual curve shows spend; only the earned curve shows achievement. Confusing them hides overruns until late.

### Re-baselining that rewrites history

If the planned curve is quietly redrawn every few months, the S-curve always looks healthy. Show the original baseline alongside approved re-baselines so trends remain visible.

### Ignoring the late flattening

As a project nears completion, the planned curve flattens and SPI drifts back towards 1.0 even for a late project, because eventually all the value is earned. Combine the S-curve with critical-path analysis and earned schedule in the final third.

### Accrual gaps

If the actual curve is built from paid invoices only, it lags real cost by weeks or months. CPI then looks better than reality until the invoices catch up.

## S-curves for cash flow and funding

The same shape matters to finance teams. A project's cumulative spend curve, adjusted for payment terms, retention and invoice timing, becomes its cash flow forecast — the basis for drawdown requests, funding facilities and treasury planning. Finance usually cares less about earned value and more about when cash leaves the bank, so a controls team that can produce a credible cash S-curve alongside the cost S-curve becomes very useful. Our guide to [project cash flow forecasting](/blog/project-cash-flow-forecasting) explains how to convert one into the other.

## Building S-curves well

1. Use one data date for all three curves.
2. Use the same unit (currency, hours or quantities) for all three.
3. Plot cumulative values, and keep the period histogram underneath for context.
4. Show the original baseline and any approved re-baselines.
5. Add a forecast line, labelled with its basis.
6. Write one or two sentences under the chart stating what it means and what is being done.

Item 6 matters most. A chart without a message invites each reader to draw a different conclusion. Our guide to the [project controls monthly report](/blog/project-controls-monthly-report) shows how to integrate S-curves into a report that leads to decisions, and our printable [earned value management cheat sheet (PDF)](/downloads/earned-value-management-cheat-sheet.pdf) summarises the formulas behind the curves.

## Where AI helps

AI tools can build S-curves directly from schedule and cost exports, detect when the earned curve's slope is changing, compare the curve's shape with historical projects of the same type and draft the commentary. Historical comparison is particularly powerful: if similar projects consistently show a flatter middle section than planned, the planned curve may be optimistic from the start. As always, the person signing the report owns the conclusion. Optimize All's free course [Project Controls with AI](/learn/project-controls-with-ai) includes S-curve and forecasting exercises using spreadsheets and Python.

## Building the skill

Earned value, S-curves and forecasting are central to the body of knowledge for the [PCI AI](https://pciai.org) PCL-AI Project Controls Leader credential. Our [PCI AI partner page](/partners/pci-ai) summarises PCI AI's certifications; check the official site for current details.

## Frequently asked questions

### Why is it called an S-curve?

Because cumulative cost or progress plotted over time usually forms an S shape: slow at the start, fast in the middle and slow again at the end.

### What does it mean if the earned curve is above the planned curve?

The project has completed more work than planned by that date — it is ahead of schedule in value terms. Check that progress measurement is credible before celebrating.

### Can S-curves be used on agile projects?

Yes, in adapted form. Cumulative story points or features completed against a planned release profile produce a similar curve, closely related to a burn-up chart.

### Should S-curves be in cost or in hours?

Either, provided all curves use the same unit. Hours often suit labour-driven work; currency suits projects with significant materials, equipment or subcontracts.

---

*Optimize All is the official marketing partner of PCI AI and Certuvo.*
