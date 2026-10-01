---
slug: estimate-at-completion-formulas
title: Estimate at Completion: Formulas and When to Use Each
description: Estimate at completion formulas explained: the CPI, CPI x SPI and bottom-up methods, ETC and TCPI, how to choose and how to report a range.
cluster: pci-ai
primaryKeyword: estimate at completion
categories: project-controls
tags: estimate at completion, eac, etc, tcpi, earned value, forecasting
related: earned-value-management-explained, earned-schedule-explained, project-controls-kpis-dashboard, schedule-risk-analysis-monte-carlo, ai-in-project-controls, project-controls-vs-project-management
publishedDaysAgo: 41
cover: project-controls
coverAlt: Dark blue cover with a forecast range band and the words Estimate at completion formulas
---
Every sponsor eventually asks the same question: what will this cost when it is finished? The answer is the **estimate at completion**, or EAC, and it is where earned value stops being a measurement exercise and becomes a decision tool. The difficulty is that there is not one EAC formula but several, each resting on a different assumption about the future. Choosing between them is the skill.

This guide sets out the main EAC variants, the related estimate to complete (ETC) and to-complete performance index (TCPI), a worked example with illustrative numbers, and how to report a range rather than a single figure. It assumes you know the earned value basics; if not, read [earned value management explained](/blog/earned-value-management-explained) first.

## The inputs

All the formulas use the same measures:

- **BAC**, budget at completion: the total approved budget.
- **EV**, earned value: the budgeted value of work completed to date.
- **AC**, actual cost: what has been spent to date.
- **PV**, planned value: the budgeted value of work scheduled to date.
- **CPI = EV / AC** and **SPI = EV / PV**.

And two definitions:

- **ETC**, estimate to complete: the cost still to be spent.
- **EAC = AC + ETC.** The only question is how to estimate ETC.

## The four common estimate at completion methods

### 1. EAC = AC + (BAC - EV): "past variances will not repeat"

Assume the overrun to date was a one-off, and the remaining work will cost what it was budgeted to cost.

Use it when the cause of the variance was a clearly identified, closed event, such as a one-time rework or a price correction already resolved, and the remaining work is genuinely unaffected.

### 2. EAC = BAC / CPI: "current efficiency continues"

Assume the project will keep performing at today's cost efficiency for the remaining work.

Use it when the causes of the variance are systemic, such as an estimate that was too low, or productivity lower than planned, and are likely to persist. It is the standard default, and a good first independent check on any other estimate.

### 3. EAC = AC + (BAC - EV) / (CPI x SPI): "cost and schedule both drive the remainder"

Assume the remaining work is affected by both cost efficiency and schedule pressure, for instance because recovering lost time means overtime or acceleration.

Use it when the project is behind schedule and will have to pay to catch up. It usually produces the highest figure of the formula-based methods when both indices are below 1.00.

### 4. EAC = AC + bottom-up ETC: "re-estimate the remaining work"

Ignore the indices and rebuild the estimate for the remaining scope from the ground up, using current information on quantities, rates, productivity and risks.

Use it when the original estimate no longer reflects reality, when scope has changed materially, or when the project is far enough along for the remaining work to be estimated with real knowledge. It is the most laborious and often the most credible.

## A worked example

This example uses illustrative figures in thousands of currency units. A project has a BAC of 2,000. At the reporting date:

- EV = 750
- AC = 900
- PV = 800

First the indices:

- CPI = 750 / 900 = 0.83
- SPI = 750 / 800 = 0.94

Now the four methods:

| Method | Calculation | EAC | Variance at completion (BAC - EAC) |
|---|---|---|---|
| 1. Past variance does not repeat | 900 + (2,000 - 750) | 2,150 | -150 |
| 2. CPI continues | 2,000 / 0.833 | 2,400 | -400 |
| 3. CPI x SPI | 900 + 1,250 / (0.833 x 0.9375) | 2,500 | -500 |
| 4. Bottom-up re-estimate of the remaining work (1,380 in this example) | 900 + 1,380 | 2,280 | -280 |

The methods span 2,150 to 2,500, a range of 350, or 17.5% of the BAC. (The table uses the unrounded indices, 0.833 and 0.9375; using the two-decimal figures shown above gives slightly different totals, which is a reminder to carry full precision until the final step.) That spread is not a failure of the method; it is the honest uncertainty of the forecast, and reporting only one number hides it.

### Choosing and explaining

Suppose the review of causes shows that part of the overrun came from a resolved supplier error (supporting method 1) but also from lower-than-planned productivity that is expected to continue (supporting method 2). The team's bottom-up estimate of 2,280 sits between them and is built on actual quantities. A sensible report might read:

"Most likely EAC 2,280 (bottom-up). Independent check: CPI-based EAC 2,400. Low case 2,150 if the remaining work performs to budget; high case 2,500 if schedule recovery requires acceleration."

This gives the sponsor a central view, a cross-check and bounds, each with a stated assumption.

## ETC and TCPI: testing whether the target is credible

ETC is simply EAC - AC. In the example, the bottom-up ETC is 1,380.

The **to-complete performance index (TCPI)** asks a different question: what cost efficiency must the remaining work achieve to hit a target?

- **TCPI to BAC = (BAC - EV) / (BAC - AC)** = 1,250 / 1,100 = 1.14
- **TCPI to EAC = (BAC - EV) / (EAC - AC)**; with the CPI-based EAC of 2,400 this is 1,250 / 1,500 = 0.83

Reading TCPI to BAC: the project must earn 1.14 units of value for every unit of cost for the rest of the project, while it has achieved 0.83 so far. That is a stretch of more than a third, and it needs a believable reason. If there is none, the original budget is no longer a realistic target and the sponsor should hear that.

A practical rule: **compare TCPI to the CPI to date.** A TCPI far above the current CPI means the plan assumes a step-change in performance. Ask what will cause it.

## Reporting a range rather than a point

A single-point EAC invites false precision. Three habits improve forecasts:

1. **Report low, most likely and high cases**, each with the assumption behind it.
2. **Show the method.** State whether the central figure is index-based or bottom-up.
3. **Track forecast accuracy.** Compare each month's EAC with the final outcome on completed projects to learn which methods are well calibrated in your organisation.

For a quantitative approach to schedule uncertainty, see [schedule risk analysis](/blog/schedule-risk-analysis-monte-carlo); the same logic of ranges and confidence levels applies to cost.

## A decision rule you can apply

When the choice of method is contested, a simple sequence helps.

1. **Start with the cause.** Ask what produced the variance to date and whether it will recur. Document the answer in one sentence.
2. **Calculate the index-based figures** as a quick bracket: BAC / CPI and the CPI x SPI version.
3. **Rebuild the remaining work** bottom-up for packages where real information exists, such as signed contracts, confirmed quantities or known productivity.
4. **Reconcile.** If the bottom-up figure is far below the index-based figures, ask what justifies the improvement; if it is far above, ask what the indices are missing.
5. **Publish the range**, with the central case and the reason it was chosen.

Doing this each period also builds a record. After a few months you can see whether the early index-based figures or the bottom-up views proved closer to the outturn, which is how a team learns which method it should trust.

## Common pitfalls

- **Using CPI before there is enough progress.** Early in a project, CPI is volatile. Many practitioners wait until a meaningful share of work is complete before relying on it.
- **Ignoring contingency and management reserve.** Decide explicitly whether EAC includes or excludes them, and say which.
- **Forgetting accruals.** Actual cost that has been incurred but not yet invoiced distorts CPI if missed.
- **Mixing progress rules.** Earned value claimed by a different method each month makes CPI meaningless.
- **Updating the baseline to hide variance.** Re-baselining requires a governed change decision, not a reporting convenience.

## AI and the EAC

AI tools can suggest EAC ranges, draft the narrative or flag outliers in cost data, and the idea of comparing an AI-produced figure with a simple method such as BAC / CPI is a good discipline. The approach in our post on [AI in project controls](/blog/ai-in-project-controls) is to treat the conventional calculation as the baseline: if the AI figure diverges sharply, it must be explained, not trusted. Every forecast that informs a decision should have a named reviewer.

## Tools that help / Learn it properly

Earned value and forecasting are among the areas [PCI AI](https://pciai.org) lists for its PCL-AI credential; consult its published body of knowledge for the official detail, since the emphasis on ranges here is our own. Our [PCI AI partner page](/partners/pci-ai) summarises the credentials, and Optimize All's free course [Project Controls with AI](/learn/project-controls-with-ai) gives hands-on forecasting practice. If you are interpreting schedule performance alongside cost, read [earned schedule explained](/blog/earned-schedule-explained) and the [one-page KPI dashboard guide](/blog/project-controls-kpis-dashboard).

## Frequently asked questions

### Which EAC formula is the best?

None is best in general. BAC / CPI is a common default and a good independent check; a bottom-up estimate is usually most credible once enough is known about the remaining work. Choose by the cause of the variance.

### What is the difference between EAC and ETC?

EAC is the total expected cost at completion. ETC is only the remaining cost. EAC = AC + ETC.

### What does a TCPI above 1.0 mean?

The remaining work must be performed more efficiently than the budget assumed to meet the target. The further above 1.0, and the further above the CPI to date, the harder the target is to defend.

### Should EAC include risk allowances?

Be explicit. Many organisations report EAC excluding unreleased contingency and show the risk exposure separately. Whatever the rule, state it in the report.

---

*Optimize All is the official marketing partner of PCI AI and Certuvo.*
