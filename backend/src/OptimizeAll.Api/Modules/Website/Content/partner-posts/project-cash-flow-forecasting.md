---
slug: project-cash-flow-forecasting
title: Project Cash Flow Forecasting: From Cost to Cash
description: A practical guide to project cash flow forecasting: converting cost forecasts to cash with payment terms, retention and milestones, with a worked example.
cluster: pci-ai
primaryKeyword: project cash flow forecasting
categories: project-controls
tags: cash flow, forecasting, project finance, cost control, project controls
related: s-curve-project-management, how-to-build-a-cost-baseline, estimate-at-completion-formulas, cfads-and-debt-sizing-explained, ai-cost-forecasting-for-projects, financial-close-in-project-finance
publishedDaysAgo: 80
cover: project-controls
coverAlt: Dark blue cover with horizontal schedule bars and the words Project controls and finance
---
A project can be on budget and still run out of money. Costs are incurred when work is done; cash leaves the bank when invoices are paid, which might be weeks or months later. Income — from a client, a lender or an internal funding allocation — arrives on its own timetable. If the timing does not line up, the project needs bridging finance, delays payments to suppliers or, at worst, stops.

**Project cash flow forecasting** bridges that gap. It converts the cost forecast into a forecast of cash out, sets it against expected cash in and shows the funding position period by period. This guide explains the mechanics, works through an example and covers how controls and finance teams can produce a forecast both trust.

## Cost is not cash

Three timelines run in parallel on every project:

| Timeline | Question | Source |
|---|---|---|
| Cost incurred | When is the work done? | Schedule, progress, accruals |
| Cash out | When do we pay for it? | Payment terms, invoicing cycles, retention |
| Cash in | When are we paid or funded? | Contract payment terms, milestones, funding drawdowns |

The cost curve comes from the time-phased [cost baseline](/blog/how-to-build-a-cost-baseline) and current forecasts. The cash curves are derived from it, shifted and reshaped by commercial terms. Plotted cumulatively, both form S-curves; the gap between them is the funding requirement. Our guide to the [S-curve in project management](/blog/s-curve-project-management) explains the cost side.

## The building blocks

### Payment terms

Supplier terms determine the lag between cost and payment — for example, 30 days from a valid invoice. Different packages may have different terms, so model them by package or cost type.

### Invoicing cycles

Subcontractors usually invoice monthly against measured progress. If work done in March is valued at month end and paid 30 days later, March's cost becomes April's or May's cash.

### Retention

Many contracts withhold a percentage of each payment as retention, released partly at completion and the remainder after a defects period. Retention reduces cash out during the project and creates a liability later.

### Advance payments and milestones

Some packages require deposits or milestone payments that do not match the cost profile — for example, 20% on order for long-lead equipment. These create cash outflows well before the cost is incurred.

### Income terms

On the income side, the project may be paid by milestones, by monthly valuations, or funded through drawdowns from equity and debt. In project finance, drawdowns typically follow a defined procedure and require certification; see our guides to [financial close](/blog/financial-close-in-project-finance) and [CFADS and debt sizing](/blog/cfads-and-debt-sizing-explained) for how funding is structured.

### Taxes, currency and escalation

Sales taxes, foreign exchange and escalation clauses can all move the cash position. Keep them visible as separate lines so their effect can be explained.

## A worked example

A six-month package has a cost forecast of 600,000, incurred evenly at 100,000 per month. Terms:

- suppliers invoice monthly in arrears and are paid 30 days after invoice;
- 5% retention is withheld from supplier payments and released three months after completion;
- the client pays monthly valuations of the work done plus a 10% margin, 45 days after month end, with no retention.

Simplifying 45 days to "paid in the second month after the work":

```
Month           1     2     3     4     5     6     7     8     9
Cost incurred  100   100   100   100   100   100
Cash out              95    95    95    95    95    95          30
Cash in                    110   110   110   110   110   110
Net             0   -95    15    15    15    15    15   110   -30
Cumulative      0   -95   -80   -65   -50   -35   -20    90    60
```

(Figures in thousands. Cash out in each month is the previous month's cost less 5% retention. Retention of 30,000 is released in month 9.)

The project's peak funding requirement is 95,000 in month 2, and it does not become cash-positive until month 8, even though it earns a margin from the start. If the client's payment terms slipped to 75 days, the peak requirement would grow and persist longer — a commercial risk worth quantifying before signing.

## Producing the forecast each month

1. **Start from the current cost forecast**, not the baseline. Use the latest estimate to complete, phased with the current schedule. Our guide to [estimate at completion](/blog/estimate-at-completion-formulas) covers the forecasting methods.
2. **Apply commercial terms by package**, including advances, retention and milestones.
3. **Add committed but unpaid amounts** from purchase orders and subcontract valuations.
4. **Forecast income** from contract terms or funding schedules.
5. **Reconcile to actual cash** from the finance system for past periods. Differences reveal timing assumptions that need correcting.
6. **Report the cumulative position, peak requirement and key sensitivities** — what happens if income is delayed by a month or a large package is accelerated.

## Owner and contractor perspectives

The same project looks different from each side of the contract.

- **Owners** care about funding: how much they must draw from equity, debt or budget allocations each month, and how much contingency they need in cash terms. Their cash out is the contractor's cash in, plus their own costs such as land, fees and financing.
- **Contractors** care about working capital: the gap between paying subcontractors and suppliers and being paid by the client. Payment terms, retention and the speed of valuation approval drive their exposure.

A forecast built from one side's assumptions should be checked against the other side's terms. Mismatches between the payment schedule the client expects and the one the contractor needs are a common source of disputes.

## Presenting the forecast

Keep the presentation simple and consistent each month:

- a cumulative chart showing cash out, cash in and the net position;
- a table with monthly and cumulative figures for the next twelve months;
- the peak funding requirement and when it occurs;
- two or three sensitivities, such as income delayed by one month or a major package accelerated;
- a short commentary explaining changes from last month's forecast.

Treasury and lenders value consistency more than sophistication: the same format, the same definitions and a clear explanation of what moved.

## Common mistakes

- **Using cost as cash.** Ignoring payment lags understates funding needs early and overstates them late.
- **Forgetting retention release.** Large retention balances become cash outflows after completion.
- **Ignoring advance payments.** Long-lead equipment deposits can create early peaks that surprise treasury.
- **One-way reconciliation.** If finance and controls each keep their own forecast, neither is trusted. Agree one model and one owner.
- **No sensitivity analysis.** Show the effect of plausible delays in payments or progress.

## Where AI helps

AI tools are useful for learning actual payment behaviour — how many days specific suppliers and clients really take to pay, compared with contract terms — and for detecting anomalies such as invoices that never arrive or duplicate payments. They can also produce scenario forecasts quickly and draft the cash commentary. Commercial terms and funding decisions still need human judgement. Our guide to [AI cost forecasting](/blog/ai-cost-forecasting-for-projects) discusses how to validate such models.

## Building the skill

Cash flow sits where project controls meets project finance. Optimize All's free course [Project Finance and Financial Modelling](/learn/project-finance-and-financial-modelling) covers cash flow, funding and coverage ratios, and [Project Controls with AI](/learn/project-controls-with-ai) covers the cost forecasting side. The [PCI AI](https://pciai.org) PCL-AI credential includes project finance within its integrated scope, and PCI AI's PFL-AI Project Finance Leader credential goes deeper; see our [PCI AI partner page](/partners/pci-ai) for an overview.

## Frequently asked questions

### What is the difference between a cost forecast and a cash flow forecast?

A cost forecast shows when costs are incurred as work is done. A cash flow forecast shows when money is actually paid and received, after payment terms, retention, advances and income timing.

### How often should a project cash flow forecast be updated?

Monthly at minimum, aligned with the cost reporting cycle. Weekly updates may be needed when funding is tight.

### Who owns the cash flow forecast?

Usually a joint responsibility: the controls team provides the cost and schedule basis, and finance applies payment data and reconciles to bank records. One named owner should sign it off.

### Why does a profitable project need funding?

Because costs are often paid before income is received. The gap between cumulative cash out and cash in is the funding requirement, which can be significant even on a profitable project.

### How does retention affect a contractor's cash flow?

Retention withholds part of each payment until completion or the end of a defects period. It improves the payer's cash position during the project and creates a receivable for the contractor that is released later, so it must be modelled explicitly.

---

*Optimize All is the official marketing partner of PCI AI and Certuvo.*
