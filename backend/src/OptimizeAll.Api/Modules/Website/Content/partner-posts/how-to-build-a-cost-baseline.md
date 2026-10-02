---
slug: how-to-build-a-cost-baseline
title: How to Build a Cost Baseline: A Step-by-Step Guide
description: Build a project cost baseline step by step: estimates, control accounts, time-phasing, contingency and approval, with a worked example and checks.
cluster: pci-ai
primaryKeyword: cost baseline
categories: project-controls
tags: cost control, budgeting, earned value, baseline, project controls
related: work-breakdown-structure-guide, contingency-vs-management-reserve, s-curve-project-management, earned-value-management-explained, cost-estimate-classification-aace, project-cash-flow-forecasting
publishedDaysAgo: 61
cover: project-controls
coverAlt: Dark blue cover with horizontal schedule bars and the words Project controls and finance
---
A cost baseline is the approved, time-phased budget against which a project's cost performance is measured. Without one, "are we over budget?" has no reliable answer: you can compare total spend with the total budget, but you cannot say whether you have spent too much *for the work achieved so far*.

This guide walks through building a **cost baseline** from scratch, with the decisions you need to make at each step, a small worked example and the checks to run before you ask anyone to approve it.

## What the cost baseline is

The cost baseline is usually defined as the approved budget for the project's work, **distributed over time**, excluding management reserve. It is the source of **planned value (PV)** in earned value management: the cumulative baseline at any date is the planned value at that date. Plotted cumulatively, it forms the familiar [S-curve](/blog/s-curve-project-management).

Three related figures are worth separating clearly:

| Term | What it contains | Who controls it |
|---|---|---|
| Cost baseline | Work package budgets plus contingency reserves, time-phased | Project manager, under change control |
| Management reserve | Funds for unidentified risks ("unknown unknowns") | Sponsor or senior management |
| Project budget | Cost baseline plus management reserve | Approved by the sponsor or funding body |

Different organisations draw these lines slightly differently, so agree the definitions in your project's control procedures. Our guide to [contingency vs management reserve](/blog/contingency-vs-management-reserve) explores the distinction in depth.

## Step 1: Start from a stable scope and WBS

The baseline cannot be better than the scope it measures. Before estimating, confirm that:

- the scope is defined to the level the estimate needs;
- the [work breakdown structure](/blog/work-breakdown-structure-guide) follows the 100% rule;
- control accounts and their owners are agreed.

If the scope is still moving, baseline what is defined and record the rest as explicit assumptions or exclusions.

## Step 2: Estimate each work package with a basis of estimate

Each work package needs a cost estimate and a written **basis of estimate (BoE)**: quantities, rates, productivity assumptions, quotes, escalation and exclusions. The BoE is what lets someone else challenge or reproduce the number later. The level of definition behind the estimate also tells you how much uncertainty it carries — our guide to [cost estimate classification](/blog/cost-estimate-classification-aace) explains how estimate classes express that.

Keep cost elements (labour, materials, equipment, subcontracts) visible within each package. They behave differently over time and are needed for forecasting later.

## Step 3: Assign budgets to control accounts

Roll work package estimates into control accounts. Each control account gets a budget, an owner and a schedule window. Two items often go astray here:

- **Planning packages.** Future work inside a control account that is not yet detailed. Give it a budget and convert it into work packages before work starts.
- **Undistributed budget.** Budget for authorised scope not yet assigned to a control account. It should be temporary and visible, not a hiding place.

## Step 4: Time-phase the budget using the schedule

This is the step that turns a budget into a baseline. Each work package's budget is spread across the periods in which the work is scheduled. The spreading method matters:

- **Linear** spreads cost evenly across the activity's duration — simple, often good enough for labour-driven work.
- **Resource-loaded** spreading follows the resource profile in the schedule, giving a more realistic curve.
- **Milestone or event-based** profiles put cost where it is incurred, for example equipment on delivery.

The spreading method should match how progress will be measured. If equipment earns value on delivery, its planned value should also land on the planned delivery date; otherwise you create artificial schedule variances.

## Step 5: Add contingency for identified risks

Contingency covers identified risks and estimating uncertainty within the scope. It can be held at project level or allocated to control accounts, depending on your governance. Quantitative risk analysis gives contingency a defensible size: for example, the difference between a base estimate and a chosen confidence level from a cost risk model. The same logic applies to time, as our guide to [schedule risk analysis](/blog/schedule-risk-analysis-monte-carlo) shows.

## Step 6: Review, approve and freeze

Before approval, run the checks below, then present the baseline with its assumptions, exclusions and risk position. Once approved, the baseline changes **only through formal change control** — not because actuals turned out differently.

## A worked example

A small software-and-hardware rollout has four work packages:

| Work package | Budget | Schedule | Spreading |
|---|---|---|---|
| Design | 60,000 | Months 1–2 | Linear |
| Hardware purchase | 120,000 | Delivery in month 3 | On delivery |
| Installation | 90,000 | Months 3–5 | Linear |
| Testing and handover | 30,000 | Month 6 | Linear |

Work package total: 300,000. Contingency from the risk review: 30,000, released by the project manager under change control. Management reserve held by the sponsor: 20,000.

Time-phased baseline (excluding contingency for simplicity):

```
Month          1       2       3        4       5       6
Design      30,000  30,000
Hardware                     120,000
Install                       30,000  30,000  30,000
Testing                                               30,000
Period      30,000  30,000   150,000  30,000  30,000  30,000
Cumulative  30,000  60,000   210,000 240,000 270,000 300,000
```

The cumulative row is the planned value curve. If hardware arrives in month 4 instead of month 3, earned value will lag planned value by 120,000 at month 3 — a schedule variance that is real and explainable. If the baseline had spread hardware evenly over six months, the same delay would have been invisible.

## Checks before approval

- Does the baseline total reconcile to the sum of control account budgets plus any project-level contingency?
- Is every control account budget tied to scope in the WBS dictionary?
- Does the time-phasing follow the current, approved schedule?
- Are spreading methods consistent with the rules of credit used for progress?
- Is management reserve held outside the baseline?
- Are escalation and currency assumptions stated?
- Does the cumulative curve look plausible — no unexplained spikes or flat periods?

## Common mistakes that undermine a baseline

- **Baselining before the schedule is ready.** If the schedule changes significantly in the first months, the time-phasing becomes obsolete almost immediately. Agree the schedule first, then phase the budget.
- **Front-loading to look good.** Spreading budget earlier than the work is planned creates early positive variances that reverse later. It also makes cash flow forecasts misleading.
- **Mixing commitments with budget.** A purchase order is a commitment, not a budget line. Track commitments separately so you can see exposure, but measure performance against the baseline.
- **Hiding contingency inside work packages.** Padding individual estimates makes it impossible to see how much risk cover remains. Keep contingency visible and managed.
- **Forgetting indirect costs.** Site establishment, supervision, insurance and project management are real costs. If they are missing from the baseline, every month will show an unexplained overspend.
- **No reconciliation to the approved funding.** The baseline plus management reserve should reconcile exactly to the budget the sponsor approved. Small unexplained differences become large arguments later.

## Keeping the baseline honest

The baseline is a commitment, not a forecast. Forecasts — estimate at completion, cash flow — move every month; the baseline moves only when scope or approved conditions change. Mixing the two ("we re-baselined because we were over budget") destroys the ability to learn from performance. Our guide to [estimate at completion](/blog/estimate-at-completion-formulas) explains how to forecast without touching the baseline, and our printable [earned value management cheat sheet (PDF)](/downloads/earned-value-management-cheat-sheet.pdf) puts the formulas that rely on the baseline on one page.

## Where AI helps

AI tools can speed up the mechanical parts: mapping cost lines to control accounts, checking that every work package has a BoE, spotting time-phasing that contradicts the schedule and drafting the baseline narrative. They should not decide contingency levels or spreading methods without review. Optimize All's free course [Project Controls with AI](/learn/project-controls-with-ai) covers cost control and governed AI in practice.

## Going further

Cost baselines, earned value and forecasting are core topics in the [PCI AI](https://pciai.org) PCL-AI credential's body of knowledge. Our [PCI AI partner page](/partners/pci-ai) summarises the certification; check the official site for current exam details.

## Frequently asked questions

### Is the cost baseline the same as the budget?

Not quite. The cost baseline is the time-phased, approved budget used to measure performance, usually excluding management reserve. The total project budget typically adds management reserve on top.

### When should a cost baseline be changed?

Only through formal change control for approved changes in scope, schedule or conditions. Poor performance is not a reason to re-baseline; it is a variance to explain and forecast.

### Does contingency belong in the baseline?

Commonly, yes: contingency for identified risks is included in the cost baseline, while management reserve for unidentified risks is held outside it. Confirm the convention in your organisation's procedures.

### How detailed should time-phasing be?

Monthly time-phasing is usual for reporting. Weekly phasing can help on short, fast projects. The key is consistency with the schedule and with how progress is measured.

---

*Optimize All is the official marketing partner of PCI AI and Certuvo.*
