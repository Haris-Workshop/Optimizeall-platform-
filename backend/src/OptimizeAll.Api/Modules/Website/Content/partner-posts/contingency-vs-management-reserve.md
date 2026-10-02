---
slug: contingency-vs-management-reserve
title: Contingency vs Management Reserve: What's the Difference?
description: Contingency vs management reserve explained: what each covers, who controls it, how to size it with risk analysis and how to report drawdowns honestly.
cluster: pci-ai
primaryKeyword: contingency vs management reserve
categories: project-controls
tags: contingency, risk management, cost control, reserves, project controls
related: how-to-build-a-cost-baseline, schedule-risk-analysis-monte-carlo, project-change-control-process, estimate-at-completion-formulas, cost-estimate-classification-aace, project-controls-monthly-report
publishedDaysAgo: 63
cover: project-controls
coverAlt: Dark blue cover with horizontal schedule bars and the words Project controls and finance
---
Few topics in project controls cause as much confusion — or as many uncomfortable meetings — as reserves. Is contingency part of the budget or a separate pot? Who can spend it? Why did the sponsor refuse to release management reserve when the project "obviously" needed it?

The confusion usually comes from mixing two different ideas. **Contingency** is for risks you have identified. **Management reserve** is for risks you have not. They are sized differently, controlled by different people and reported differently. This guide explains the difference, shows how to size each and sets out a simple, honest way to report drawdowns.

## The short answer

| | Contingency | Management reserve |
|---|---|---|
| Covers | Identified risks and estimating uncertainty within the agreed scope ("known unknowns") | Unidentified risks within the scope ("unknown unknowns") |
| Usually part of | The cost baseline | The total project budget, but outside the cost baseline |
| Controlled by | The project manager, under defined rules | The sponsor or senior management |
| Sized by | Risk register and quantitative risk analysis | Policy, benchmarks or a percentage set by the organisation |
| Earned value treatment | Moves into control accounts when allocated | Not part of performance measurement until released into the baseline |

Terminology varies. Some organisations call contingency a "risk allowance" or "project reserve", and some hold both reserves at the same level. The principle — separating identified from unidentified risk — is what matters. Always check your organisation's own definitions.

## Neither reserve is for scope changes

The most important rule is what reserves are **not** for. New scope, client-requested changes and changes in project objectives should go through [change control](/blog/project-change-control-process) and be funded by an approved budget change. If scope growth is quietly paid for from contingency, the project will run out of money for the risks contingency was meant to cover — and nobody will notice until too late.

## Sizing contingency

There are three common approaches, in increasing order of rigour.

### 1. Percentage of base estimate

A flat percentage based on the estimate's maturity, for example a higher percentage for an early-stage estimate than for a detailed one. It is quick, but it ignores the specific risks of this project. It is most defensible when tied to estimate classes; our guide to [cost estimate classification](/blog/cost-estimate-classification-aace) explains how expected accuracy ranges narrow as definition improves.

### 2. Expected value of identified risks

For each cost risk in the register, multiply probability by impact and add them up. This links contingency to named risks, which makes drawdowns traceable. Its weakness is that it treats risks as independent averages and ignores how they combine.

### 3. Quantitative risk analysis

A Monte Carlo cost (or integrated cost and schedule) model combines estimating uncertainty and risk events to produce a distribution of outcomes. Contingency is then the difference between the base estimate and a chosen confidence level — for example, P80 minus base. The method is explained for schedules in our guide to [schedule risk analysis](/blog/schedule-risk-analysis-monte-carlo); cost models follow the same logic.

The choice of confidence level is a governance decision, not a technical one. A public infrastructure programme may fund to a higher confidence level than a private developer comfortable with more risk.

## Sizing management reserve

Management reserve cannot be derived from the risk register, because by definition it covers what the register does not contain. Organisations usually set it by policy, informed by history: how much did similar projects need beyond their identified risks? Keep it explicit and separate, so that it is neither forgotten nor spent casually.

## A worked example

A project has a base estimate of 10.0 million. A Monte Carlo cost model gives:

- P50 outcome: 10.6 million
- P80 outcome: 11.2 million

The organisation's policy is to fund the cost baseline at P80 and to hold management reserve of 3% of the base estimate.

```
Contingency (P80 - base)          = 11.2m - 10.0m = 1.2m
Cost baseline (base + contingency) = 11.2m
Management reserve (3% of base)    = 0.3m
Total project budget               = 11.5m
```

In month 9, a known risk occurs: ground conditions are worse than expected, adding 0.4 million to the foundations. That risk was in the register, so the project manager allocates 0.4 million of contingency to the foundations control account. The baseline total does not change, but the contingency balance falls to 0.8 million.

In month 14, a supplier unexpectedly goes into administration — a risk nobody had identified. The project manager requests 0.25 million from management reserve. The sponsor approves, the amount is moved into the baseline through change control, and the management reserve falls to 0.05 million.

## Reporting drawdowns honestly

A simple reserve table in the [monthly controls report](/blog/project-controls-monthly-report) prevents most arguments:

| Reserve | Original | Drawn to date | Remaining | Remaining identified exposure |
|---|---|---|---|---|
| Contingency | 1.20m | 0.40m | 0.80m | 0.95m |
| Management reserve | 0.30m | 0.25m | 0.05m | n/a |

The last column is the most important. In this example, the remaining identified risk exposure (0.95 million) exceeds the remaining contingency (0.80 million). That is an early warning that belongs in front of the sponsor now, not when the contingency runs out.

Watch for these patterns:

- **Contingency burn faster than progress.** If 60% of contingency is gone at 30% complete, the forecast needs attention.
- **Contingency never touched.** Either risks are not occurring (good) or costs are being absorbed in control accounts without being tracked (bad).
- **Reserves used for scope.** A drawdown with no linked risk ID is a red flag.

## Reserves and the forecast

Reserves interact with the estimate at completion. A sensible convention is to report EAC both with and without remaining contingency, so stakeholders see the expected outcome and the risk cover separately. Our guide to [estimate at completion](/blog/estimate-at-completion-formulas) explains the forecasting methods, and [building a cost baseline](/blog/how-to-build-a-cost-baseline) shows where contingency enters the baseline.

## Schedule contingency is a reserve too

Everything above applies to time as well as money. A schedule built on most-likely durations has roughly even odds — often worse — of meeting its finish date, because risks tend to push dates later rather than earlier. Many planners therefore hold **schedule contingency**: a visible buffer activity before a key milestone, sized from a schedule risk analysis in the same way as cost contingency.

Two rules keep schedule contingency useful:

1. **Make it visible.** A buffer activity named "schedule contingency" before completion is honest. Padding hidden inside individual activity durations is not, because it is consumed silently by Parkinson's law — work expands to fill the time available.
2. **Link cost and time.** A delay that consumes schedule contingency usually costs money too: extended site overheads, equipment hire and supervision. If your cost contingency was sized without time-related costs, it will run short when the schedule slips.

## A reserve governance checklist

Before the baseline is approved, confirm that your control procedures answer these questions in writing:

- What is contingency for, and what is explicitly excluded (scope changes, client variations, escalation beyond agreed indices)?
- Who can allocate contingency, and up to what amount per decision?
- Is contingency held centrally or allocated to control accounts, and when is it moved?
- Who controls management reserve, and how is a release requested and approved?
- How are reserve movements recorded — with a risk ID, a change ID and a date?
- How often is contingency re-assessed against the remaining risk exposure?
- What happens to contingency when risks retire?

Writing these down at the start removes most of the arguments later, because the rules were agreed before anybody needed the money.

## Where AI helps

AI tools can link drawdowns to risk IDs, flag drawdowns without a linked risk, compare contingency burn with progress and draft the reserve narrative. They can also help maintain the risk register by spotting duplicated or stale risks. Decisions about confidence levels and releases stay with people who are accountable for them. Optimize All's free course [Project Controls with AI](/learn/project-controls-with-ai) covers risk registers, Monte Carlo analysis and governed AI.

## Building the skill

Risk, contingency and forecasting are part of the integrated body of knowledge behind the [PCI AI](https://pciai.org) PCL-AI Project Controls Leader credential. See our [PCI AI partner page](/partners/pci-ai) for an overview, and check PCI AI's site for the current exam details.

## Frequently asked questions

### Is contingency part of the cost baseline?

In most conventions, yes — contingency for identified risks is included in the cost baseline, while management reserve sits outside it. Confirm the convention in your organisation's procedures.

### Can the project manager use management reserve?

Usually not without approval. Management reserve is typically controlled by the sponsor or senior management and released into the baseline through change control.

### What happens to unused contingency?

It depends on governance. Some organisations return it to the portfolio as risks retire; others hold it until completion. Retiring contingency as risks close keeps the forecast honest.

### How much contingency is enough?

There is no universal percentage. A quantitative risk analysis at a confidence level chosen by the organisation gives the most defensible answer.

---

*Optimize All is the official marketing partner of PCI AI and Certuvo.*
