---
slug: cost-estimate-classification-aace
title: Cost Estimate Classification: Class 5 to Class 1 Explained
description: How cost estimate classes work, from Class 5 concept screening to Class 1 check estimates, with accuracy ranges, uses and how to communicate them.
cluster: pci-ai
primaryKeyword: cost estimate classification
categories: project-controls
tags: cost estimating, estimate classes, aace, contingency, project controls
related: how-to-build-a-cost-baseline, contingency-vs-management-reserve, project-controls-certifications-compared, estimate-at-completion-formulas, what-is-project-controls, ai-cost-forecasting-for-projects
publishedDaysAgo: 67
cover: project-controls
coverAlt: Dark blue cover with horizontal schedule bars and the words Project controls and finance
---
"How much will it cost?" is the first question every sponsor asks, and the honest answer at the start of a project is usually "somewhere in a wide range". The problem is that a single number tends to get remembered, quoted and treated as a commitment, even when it was produced from a one-page concept.

**Cost estimate classification** solves this by attaching a class to every estimate: a label that says how much of the project was defined when the estimate was made, what it is fit to be used for and how wide its likely accuracy range is. The most widely referenced scheme comes from AACE International's recommended practices, which define five classes from Class 5 (least defined) to Class 1 (most defined). This guide explains the classes, shows how to use them and covers the mistakes that make estimates look more certain than they are.

A note on sources: AACE publishes several classification recommended practices for different industries, and the figures below follow the generic pattern most often quoted for the process industries. Always check the current AACE recommended practice that applies to your sector before relying on specific figures.

## The core idea: maturity drives accuracy

An estimate's accuracy depends mainly on how well the project is defined: how complete the scope, design, site information and execution plan are. As definition improves, the estimating method becomes more detailed and the range of likely outcomes narrows. Classification makes that relationship explicit.

## The five classes at a glance

| Class | Typical maturity of definition | Typical end use | Typical method | Indicative accuracy range |
|---|---|---|---|---|
| 5 | Very early (roughly 0–2% defined) | Concept screening | Capacity-factored, parametric, analogy, judgement | Low −20% to −50%; high +30% to +100% |
| 4 | Early (roughly 1–15%) | Study or feasibility | Equipment-factored or parametric | Low −15% to −30%; high +20% to +50% |
| 3 | Intermediate (roughly 10–40%) | Budget authorisation or control | Semi-detailed unit costs with assembly-level line items | Low −10% to −20%; high +10% to +30% |
| 2 | Advanced (roughly 30–75%) | Control or bid/tender | Detailed unit costs with forced detailed take-off | Low −5% to −15%; high +5% to +20% |
| 1 | Full (roughly 65–100%) | Check estimate or bid/tender | Detailed unit costs with detailed take-off | Low −3% to −10%; high +3% to +15% |

Read the accuracy ranges carefully. They are **ranges of ranges**: a Class 3 estimate's low side might be anywhere from −10% to −20% depending on the project's complexity, technology, and the quality of the estimating data. They are also asymmetric — the high side is wider than the low side, because projects tend to overrun more often than they underrun.

## How to use the classes in practice

### Label every estimate

Every estimate that leaves the estimating team should carry its class, its date and its basis. "Class 4, prepared 12 May, based on the feasibility layout and three vendor budget quotes" tells a reader immediately how much weight the number can bear.

### Match the class to the decision

The class should fit the decision being made:

- **Should we study this further?** A Class 5 estimate is enough.
- **Which option should we take forward?** Class 4 is typical.
- **Should we approve funding and set a baseline?** Many organisations require Class 3 before final investment decisions.
- **Is this tender price realistic?** Class 2 or Class 1.

A Class 5 estimate used to set a firm budget is a common source of "overruns" that were really optimistic early numbers.

### Express the result as a range

Present the estimate as a point value plus a range: "Base estimate 48 million; Class 4; expected range 40 to 67 million." Better still, derive the range from a quantitative risk analysis rather than generic percentages, and use it to size contingency. Our guide to [contingency vs management reserve](/blog/contingency-vs-management-reserve) shows how.

## A worked example

A water utility is considering a new pumping station.

- **Concept stage.** Using the cost per unit of capacity from three past stations, the estimator produces a Class 5 estimate of 12 million. Applying an indicative range of −30% to +60% gives roughly 8.4 to 19.2 million. That is enough to decide the idea is worth a feasibility study, not enough to put in a budget.
- **Feasibility.** With a preliminary layout and equipment list, an equipment-factored Class 4 estimate gives 13.5 million, with a range of about −20% to +35% (10.8 to 18.2 million). Two options are compared on the same basis.
- **Funding decision.** With design further developed, a Class 3 estimate of 14.1 million, combined with a quantitative risk analysis, supports a funded budget at the organisation's chosen confidence level. This becomes the basis of the [cost baseline](/blog/how-to-build-a-cost-baseline).

The headline numbers moved from 12 to 14.1 million. Without classification, that looks like a 17% overrun before a spade hits the ground. With classification, it is the expected maturing of an estimate that always carried a wide range.

## Common mistakes

- **Quoting the point value without the class.** Numbers travel; labels get lost. Put the class in the title of the document and the summary table.
- **Upgrading the class without upgrading the definition.** Adding more line items to a Class 4 estimate does not make it Class 3. Class follows project definition, not estimate detail.
- **Using generic ranges as contingency.** The class range describes typical uncertainty; contingency for a specific project should be based on its own risks.
- **Ignoring escalation and currency.** Accuracy ranges assume consistent pricing bases. State the price date, escalation assumptions and exchange rates.

## Communicating estimates to sponsors

A simple estimate summary for decision makers might include:

1. The base estimate and its class.
2. The range or confidence levels (for example P50 and P80).
3. The three to five assumptions that would move the number most.
4. What is excluded.
5. What would be needed to reach the next class, and when.

This keeps the conversation on risk and decisions rather than on defending a single number.

## What a basis of estimate should record

Classification only works if the estimate's basis is written down. A practical basis of estimate (BoE) for any class records:

- **Scope and definition** — the documents and drawings used, with revision numbers, and the resulting class;
- **Methodology** — parametric, factored, unit-rate or detailed take-off, and for which parts of the estimate;
- **Pricing basis** — the price date, currency, exchange rates and sources (quotes, databases, historical projects);
- **Escalation** — the indices or assumptions used to move costs to the expected time of spend;
- **Allowances** — items such as design growth that are expected but not yet quantified;
- **Exclusions** — what the number does not cover, such as land, financing or owner's costs;
- **Risks and opportunities** — the main drivers of uncertainty, which feed contingency;
- **Benchmarking** — how the estimate compares with similar completed projects, and why it differs.

Two estimates with the same class can differ greatly in reliability depending on the quality of these records. When reviewing an estimate, read the BoE before the totals.

## Where AI helps

AI tools can help assemble benchmark data, check a basis of estimate for missing elements, compare line items against historical projects and draft the estimate narrative. They can also flag inconsistencies, such as a Class 3 label on an estimate built mostly from factored allowances. Like any estimating tool, their output needs a stated basis and a reviewer. Our guide to [AI cost forecasting](/blog/ai-cost-forecasting-for-projects) covers how to use these tools without losing traceability, and Optimize All's free course [Project Controls with AI](/learn/project-controls-with-ai) includes cost engineering and estimating lessons.

## Building the skill

Estimating sits at the start of the control cycle and links directly to baselines, contingency and forecasting — all part of the integrated scope of the [PCI AI](https://pciai.org) PCL-AI credential. AACE International also offers estimating and cost credentials; our comparison of [project controls certifications](/blog/project-controls-certifications-compared) explains how they differ. See our [PCI AI partner page](/partners/pci-ai) for an overview of PCI AI's three certifications.

## Frequently asked questions

### Is a Class 1 estimate always accurate?

No estimate is certain. Class 1 has the narrowest typical range because the project is almost fully defined, but unexpected events can still move costs.

### Which class is needed for a final investment decision?

It depends on the organisation and sector. Many require at least a Class 3 estimate for funding approval, often combined with a quantitative risk analysis.

### Do these classes apply outside process industries?

AACE publishes classification practices for several sectors, such as building and infrastructure. The principle is the same, but the specific definitions and ranges differ, so use the practice that fits your industry.

### Can AI produce a Class 3 estimate from a concept?

No. The class depends on project definition, not on the tool. AI can speed up an estimate but cannot create design information that does not yet exist.

---

*Optimize All is the official marketing partner of PCI AI and Certuvo.*
