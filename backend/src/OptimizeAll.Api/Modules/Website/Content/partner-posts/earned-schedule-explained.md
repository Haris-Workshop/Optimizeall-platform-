---
slug: earned-schedule-explained
title: Earned Schedule Explained: Fixing SPI Late in a Project
description: Earned schedule explained with a worked example: why SPI misleads late in a project and how ES, AT and SV(t) give a time-based view you can trust.
cluster: pci-ai
primaryKeyword: earned schedule
categories: project-controls
tags: earned schedule, earned value, spi, schedule performance, forecasting
related: earned-value-management-explained, estimate-at-completion-formulas, critical-path-method-explained, schedule-risk-analysis-monte-carlo, project-controls-kpis-dashboard, what-is-pcl-ai-certification
publishedDaysAgo: 39
cover: project-controls
coverAlt: Dark blue cover with an S-curve and the words Earned schedule and project controls
---
A project is two months late. Its schedule performance index says 0.95. Both statements are true, and that is the problem. Conventional earned value measures schedule in money, and money-based schedule measures drift towards a perfect score as a project approaches its end, whatever has happened along the way. **Earned schedule** fixes this by measuring schedule performance in units of time instead.

This guide explains why SPI misleads late in a project, defines earned schedule (ES), actual time (AT) and schedule variance in time, SV(t), works a full example with illustrative numbers, and shows when to use the method and where AI can and cannot help. If you need the basics first, start with [earned value management explained](/blog/earned-value-management-explained).

## Why SPI misleads late in a project

Conventional schedule variance is SV = EV - PV, and SPI = EV / PV. Both are in cost terms: they compare the value of work done with the value of work planned.

Now consider the end of the project. Suppose the plan was to finish in month 10, with a budget at completion of 1,000 (illustrative units). If the project actually finishes in month 12, then at month 12 earned value is 1,000 and planned value is 1,000. SV is 0 and SPI is 1.00. By that measure, the project was never late.

The effect is not limited to the very last day. Once planned value has reached its total, the planned value curve is flat, so every unit of earned value reduces the apparent shortfall even when the project is slipping further behind in calendar time. SPI therefore gives a more optimistic picture the later you read it. That is exactly when sponsors ask whether the project will finish on time.

## The idea behind earned schedule

Earned schedule asks a different question: **at what point in the baseline plan should the work already done have been completed?**

Take the earned value you have achieved and read it off the planned value curve horizontally, to find the time at which the baseline planned to have earned that much. That time is the earned schedule. If you have earned what the plan said you would have earned by month 8.5, your earned schedule is 8.5, regardless of how many months have actually elapsed.

### The key measures

- **ES (earned schedule):** the baseline time at which the current earned value was planned to be achieved.
- **AT (actual time):** how long the project has been running.
- **SV(t) = ES - AT:** schedule variance in time units. Negative means behind.
- **SPI(t) = ES / AT:** the time-based schedule performance index.
- **Forecast duration = planned duration / SPI(t):** a simple independent estimate of total duration, assuming the future performs like the past. Practitioners often write this as IEAC(t), the independent estimate at completion in time.

Because these are measured in months or weeks, a sponsor can understand them immediately: "we are 2.5 months behind" is clearer than "SPI is 0.95".

### A note on conventions

Two conventions are worth fixing before you build a spreadsheet. First, ES is usually written as the number of whole periods in which cumulative PV is at or below EV, plus an interpolated fraction of the next period; the example below does exactly that. Second, the duration forecast has two common forms. Dividing the planned duration by SPI(t) assumes the remaining work will proceed at the pace achieved so far. The alternative, AT plus (planned duration minus ES), assumes the remaining work will proceed exactly to plan. Reporting both brackets the outcome, in the same way that the different [estimate at completion formulas](/blog/estimate-at-completion-formulas) bracket a cost forecast.

## A worked example

This example uses illustrative figures. The baseline plan is 10 months with a budget at completion of 1,000. The cumulative planned value at the end of each month is:

| Month end | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Cumulative PV | 40 | 110 | 220 | 360 | 520 | 680 | 820 | 920 | 975 | 1,000 |

At the end of month 11, the project has been running for 11 months (AT = 11) and has earned 950.

### Step 1: conventional measures

At month 11, planned value is 1,000, because the baseline finished in month 10. Then:

- SV = 950 - 1,000 = -50
- SPI = 950 / 1,000 = 0.95

A reader would see a minor shortfall of 5%, something that looks recoverable.

### Step 2: find the earned schedule

Find the last month in which cumulative PV is at or below the earned value of 950. That is month 8 (PV 920). The next month, month 9, has PV 975. Interpolate:

ES = 8 + (950 - 920) / (975 - 920) = 8 + 30 / 55 = 8.55 months

So the work completed to date was planned to be finished by about month 8.55.

### Step 3: time-based measures

- SV(t) = 8.55 - 11 = -2.45 months
- SPI(t) = 8.55 / 11 = 0.78
- Forecast duration = 10 / 0.78 = about 12.9 months (using unrounded values, 12.87)
- Forecast duration if the remaining work goes to plan = 11 + (10 - 8.55) = 12.45 months

### Reading the result

| Measure | Value | What a sponsor hears |
|---|---|---|
| SPI | 0.95 | "Slightly behind" |
| SV(t) | -2.45 months | "About two and a half months behind" |
| SPI(t) | 0.78 | "Progressing at roughly three quarters of the planned rate" |
| Forecast duration | about 12.5 to 12.9 months | "Expect to finish two and a half to three months late unless something changes" |

Both views use the same data. Only one tells the truth about time. Note too that SPI(t) of 0.78 corresponds to a project that is behind on pace, while the SPI of 0.95 would have hidden that.

## When to use earned schedule

Earned schedule is a useful complement, not a replacement, in these situations:

- **Late-stage projects**, where SPI has begun to converge to 1.00.
- **Projects with strong cost-loaded baselines**, where planned value reflects planned effort reasonably well.
- **Executive reporting**, where "months behind" communicates better than an index.
- **Cross-checking critical path forecasts**, as an independent top-down view.

It has limits worth knowing:

1. **It depends on the quality of planned value.** If the baseline is poorly cost-loaded or progress is measured badly, ES inherits the errors.
2. **It does not identify the critical path.** A project can have a poor ES while the critical path is fine, or the reverse, if work done is non-critical. The critical path method remains the authority on which activities drive the finish date; see [critical path method explained](/blog/critical-path-method-explained).
3. **It assumes the future resembles the past.** The duration forecast is a trend, not a promise.
4. **It needs consistent re-baselining rules.** If the baseline is revised, the PV curve changes, and so does every ES.

### Combining earned schedule with other forecasts

Good practice triangulates. Compare the earned schedule forecast with the critical path forecast and, where it is available, the output of a quantitative schedule risk analysis such as the one described in [schedule risk analysis: reading P50 and P80 dates](/blog/schedule-risk-analysis-monte-carlo). If the three agree, confidence rises. If they diverge, the divergence is itself information: perhaps the critical path logic is optimistic, or the baseline PV is mis-phased.

## Where AI helps and where it does not

Earned schedule calculations are simple enough to do in a spreadsheet, so the question is rarely about computing them. AI can still help in several ways:

- **Drafting the explanation** of an ES result for a non-technical audience.
- **Checking for anomalies**, such as a month in which ES falls, which usually signals a data error or a re-baseline.
- **Spotting patterns** across many projects in a portfolio.

The cautions are important:

- Do not paste confidential schedule data into a tool your organisation has not approved for it.
- Recalculate any figure an AI tool reports. A transposed digit in a PV table changes ES.
- Make sure a named person reviews and takes responsibility for any forecast that goes to a sponsor, and disclose where AI helped. Our post on [AI in project controls](/blog/ai-in-project-controls) sets out a lightweight framework for this.

## A quick checklist

1. Use the baseline PV curve currently approved.
2. Confirm earned value is measured by agreed rules, not by elapsed time.
3. Interpolate within the month, as in the example.
4. Report SV(t) in months or weeks and SPI(t) alongside the conventional SPI.
5. State the assumption behind the forecast duration.
6. Compare with the critical path forecast before publishing.

## Tools that help / Learn it properly

Earned value and forecasting are among the areas [PCI AI](https://pciai.org) lists for its PCL-AI credential; read its official body of knowledge for the authoritative scope, since the way this article groups the topics is our own. Our [PCI AI partner page](/partners/pci-ai) summarises the three PCI AI certifications, and Optimize All's free course [Project Controls with AI](/learn/project-controls-with-ai) includes exercises on earned value and forecasting. For a broader view of the credential, see the [PCL-AI certification guide](/blog/what-is-pcl-ai-certification).

## Frequently asked questions

### Is earned schedule part of standard earned value management?

It is an extension that many practitioners use alongside conventional EVM. It keeps the same inputs, planned value and earned value, but expresses schedule performance in time units.

### Why does SPI always end at 1.00?

Because at completion, earned value equals planned value (both equal the budget at completion), whatever the actual finish date. Earned schedule avoids this, since ES is compared with actual time rather than with a cost figure.

### Can earned schedule replace critical path analysis?

No. It gives a top-down indication of schedule performance, whereas critical path analysis tells you which activities drive the finish date. Use both.

### How often should I calculate it?

At each reporting period, using the same cut-off as your earned value report. Trends over several periods are more informative than a single reading.

---

*Optimize All is the official marketing partner of PCI AI and Certuvo.*
