---
slug: progress-measurement-methods
title: Progress Measurement Methods: Rules of Credit Explained
description: Compare progress measurement methods for earned value: weighted milestones, units complete, 0/100, 50/50, percent complete and level of effort.
cluster: pci-ai
primaryKeyword: progress measurement methods
categories: project-controls
tags: progress measurement, rules of credit, earned value, reporting, project controls
related: earned-value-management-explained, s-curve-project-management, work-breakdown-structure-guide, how-to-build-a-cost-baseline, project-controls-kpis-dashboard, project-controls-monthly-report
publishedDaysAgo: 73
cover: project-controls
coverAlt: Dark blue cover with horizontal schedule bars and the words Project controls and finance
---
Earned value is only as good as the progress it is built on. If "60% complete" means "the supervisor feels it is about 60% done", earned value becomes opinion expressed in currency — and every index, forecast and S-curve built on it inherits that opinion.

**Progress measurement methods**, often called rules of credit, fix this by agreeing in advance how each kind of work earns value. This guide compares the main methods, explains when each fits, works through examples and lists the controls that keep progress claims honest.

## Why the method matters

Two teams can do exactly the same work and report very different progress depending on how they measure it. That affects:

- **Earned value** — and therefore CPI, SPI and every forecast. See [earned value management explained](/blog/earned-value-management-explained).
- **Payments** — many contracts pay against measured progress.
- **Behaviour** — people optimise what is measured. A method that rewards starting work encourages starting everything and finishing nothing.

The best time to agree methods is when building the [work breakdown structure](/blog/work-breakdown-structure-guide) and the baseline, before any work starts.

## The main methods

### Units complete

Progress equals completed quantity divided by total quantity: metres of pipe laid, cubic metres poured, drawings issued. It is the most objective method when the work is made of similar, countable units.

*Example:* 1,200 m of cable installed out of 4,000 m = 30% complete.

*Watch out for:* units of very different difficulty. The last 200 m through a congested plant room may take as long as the first 1,000 m in open trench.

### Weighted (incremental) milestones

The work is broken into steps, each with an agreed weight. Value is earned as each step is completed.

*Example (instrument installation):*

| Step | Weight |
|---|---|
| Received on site | 10% |
| Installed | 40% |
| Connected | 25% |
| Loop checked | 15% |
| Commissioned | 10% |

This is the workhorse of construction and engineering progress. It is objective (a step is either done or not) and gives regular credit across long activities.

*Watch out for:* weights that front-load credit. If "received on site" earns 40%, progress looks excellent while nothing has been installed.

### Fixed formula: 0/100, 50/50 and 25/75

Value is earned at start and finish only.

- **0/100** — nothing until complete. Very conservative; suits short activities.
- **50/50** — half at start, half at finish. Suits activities spanning about two reporting periods.
- **25/75** — a quarter at start, the rest at finish.

*Watch out for:* using fixed formulas on long activities. A six-month activity at 50/50 earns half its value on day one and nothing until month six.

### Percent complete (estimated)

A responsible person estimates the percentage complete. It is flexible and sometimes the only practical option, for example for design or software work that does not divide into clear steps.

*Watch out for:* subjectivity and the "90% syndrome" — work that reaches 90% quickly and stays there for months. Pair it with evidence (reviewed deliverables, test results) and cap claims until defined checkpoints are passed.

### Level of effort (LOE)

Value is earned with the passage of time — project management, site supervision, administration. It is legitimate for support activities that do not produce discrete deliverables.

*Watch out for:* overuse. LOE always shows SPI of 1.0, so a large LOE share masks genuine variances in discrete work. Keep it small and report it separately.

### Apportioned effort

Value is tied to another activity's progress — for example, quality inspection earned in proportion to the work it inspects.

## Choosing the method: a quick guide

| Work type | Typical method |
|---|---|
| Repetitive, countable work | Units complete |
| Multi-step installation or fabrication | Weighted milestones |
| Short activities (up to one or two periods) | 0/100 or 50/50 |
| Design, studies, software features | Weighted milestones by deliverable stage, or capped percent complete |
| Management and support | Level of effort |
| Inspection and supervision tied to other work | Apportioned effort |

## A worked example: one month, three methods

A work package of 20 identical pump skids has a budget of 400,000 (20,000 each). At month end:

- 6 skids commissioned
- 4 skids installed but not connected
- 5 skids delivered only
- 5 not yet started

**Weighted milestones** (delivered 10%, installed 40%, connected 25%, loop checked 15%, commissioned 10%):

```
Commissioned: 6 x 20,000 x 100% = 120,000
Installed:    4 x 20,000 x 50%  =  40,000   (delivered 10% + installed 40%)
Delivered:    5 x 20,000 x 10%  =  10,000
EV = 170,000  (42.5%)
```

**Units complete (commissioned skids only):** 6 ÷ 20 = 30% → EV = 120,000.

**Supervisor's estimate:** "about 55%" → EV = 220,000.

The range — 120,000 to 220,000 — is wider than many monthly variances. That is why the method must be agreed up front and applied consistently.

## Measuring design and engineering progress

Design work is where progress measurement is hardest, because a drawing or a specification does not divide neatly into units. The most reliable approach is to treat each deliverable — a drawing, a calculation, a datasheet — as a unit and give it weighted milestones by stage, for example:

| Deliverable stage | Cumulative credit |
|---|---|
| Started (internal draft) | 15% |
| Issued for internal review | 40% |
| Issued for client review | 70% |
| Approved or issued for construction | 100% |

The deliverable register then becomes the progress system: count deliverables at each stage, apply the weights and sum the budgets. Two cautions apply. First, revisions after client comments consume real effort but earn nothing under this scheme, so heavy comment cycles show up as a falling CPI — which is exactly the signal you want. Second, keep the deliverable list under change control; adding drawings without budget inflates progress denominators and distorts the picture.

## Physical progress, earned value and payment are not the same thing

Three related numbers are often confused:

- **Physical progress** — how much of the work is done, measured by the rules of credit.
- **Earned value** — physical progress expressed in budget terms for each work package and summed.
- **Payment progress** — what the contract allows the contractor to invoice, which may include advance payments, retention and materials on site.

A contractor can be paid for materials delivered to site before they are installed, so payment progress may run ahead of physical progress. Using payment figures as earned value inflates performance. Keep the three separate in the controls system and reconcile them monthly.

## Controls that keep progress honest

1. **Written rules of credit** for each work package in the WBS dictionary.
2. **Evidence** for each claimed step: inspection records, test sheets, delivery notes, photos.
3. **Independent verification** of a sample of claims each period.
4. **Consistency with the baseline** — the planned value curve should be phased using the same rules, otherwise you create artificial variances. Our guide to the [cost baseline](/blog/how-to-build-a-cost-baseline) explains why.
5. **Trend checks** — sudden jumps in percent complete without matching physical evidence deserve a question.
6. **No retrospective changes** to rules mid-project without formal change control.

## Where AI helps

AI tools are increasingly used to cross-check progress claims against independent data: delivery records, inspection databases, site photos and drone surveys. A model can flag a work package claiming 70% while no inspection records exist, or summarise which areas show the largest gap between claimed and evidenced progress. These are prompts for a human check, not replacements for agreed rules of credit — and progress percentages should never be inferred by a model without a defined basis. Our printable [earned value management cheat sheet (PDF)](/downloads/earned-value-management-cheat-sheet.pdf) includes a rules-of-credit summary, and Optimize All's free course [Project Controls with AI](/learn/project-controls-with-ai) covers progress measurement and governed AI with worked exercises.

## Building the skill

Progress measurement underpins earned value, which is at the core of the [PCI AI](https://pciai.org) PCL-AI Project Controls Leader credential. See our [PCI AI partner page](/partners/pci-ai) for an overview, and the official site for current exam information.

## Frequently asked questions

### What is the most accurate progress measurement method?

The most objective methods are units complete and weighted milestones, because they rely on verifiable events. The right method depends on the type of work; a mix across the WBS is normal.

### What does 50/50 mean in earned value?

It means 50% of an activity's budget is earned when it starts and the remaining 50% when it finishes. It suits activities that span roughly two reporting periods.

### Why should level of effort be limited?

Level of effort earns value with time, so its schedule performance is always on plan. A large share of it dilutes the signals from discrete work and can hide real problems.

### Can progress rules change during the project?

Only through formal change control, and with care. Changing rules mid-project breaks comparability with earlier periods and can create artificial variances.

---

*Optimize All is the official marketing partner of PCI AI and Certuvo.*
