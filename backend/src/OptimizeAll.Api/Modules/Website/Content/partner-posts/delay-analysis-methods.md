---
slug: delay-analysis-methods
title: Delay Analysis Methods: TIA, Windows and As-Built Compared
description: Compare delay analysis methods — impacted as-planned, time impact analysis, windows, as-planned vs as-built and collapsed as-built — with when to use each.
cluster: pci-ai
primaryKeyword: delay analysis methods
categories: project-controls
tags: delay analysis, scheduling, claims, critical path, project controls
related: critical-path-method-explained, dcma-14-point-schedule-assessment, project-change-control-process, schedule-risk-analysis-monte-carlo, project-scheduling-software-guide, resource-levelling-explained
publishedDaysAgo: 79
cover: project-controls
coverAlt: Dark blue cover with horizontal schedule bars and the words Project controls and finance
---
When a project finishes late, someone eventually asks: who caused the delay, and by how much? The answer can determine extensions of time, liquidated damages, prolongation costs and sometimes the outcome of a dispute. **Delay analysis methods** are the structured ways schedulers and experts answer that question using the project's schedules and records.

This guide explains the main methods, how they differ, when each is appropriate and what records you need to keep during the project so that any analysis is credible. It is an introduction for planners and controls professionals, not legal advice: contracts, jurisdictions and tribunals vary, and significant claims need specialist and legal input.

## Two reference frameworks

Two publications are widely referenced in delay analysis:

- the **Society of Construction Law Delay and Disruption Protocol**, which sets out guidance on managing delay during a project and on methods of analysis after the event;
- **AACE International's recommended practice on forensic schedule analysis**, which classifies methods by their characteristics.

Both stress that no method is universally correct. The right choice depends on the contract, the records available, the time available and the question being asked. Check the current editions of these documents if you are preparing an analysis.

## Prospective vs retrospective

A key distinction is **when** the analysis is done:

- **Prospective (contemporaneous)** analysis forecasts the likely effect of an event while the project is ongoing, so that time can be granted or the programme adjusted. Many modern contracts expect this.
- **Retrospective** analysis looks back after the delay has occurred, using what actually happened.

The same method can sometimes be used either way, but the data and the question differ.

## The main methods

### Impacted as-planned

Delay events are inserted into the original baseline programme, and the resulting shift in completion is measured.

- **Strengths:** simple, quick, needs only the baseline and the events.
- **Weaknesses:** ignores actual progress and contractor delays. It answers "what would have happened to the original plan?" rather than "what happened?".
- **Typical use:** early assessments, simple projects or where the contract requires it.

### Time impact analysis (TIA)

A fragnet — a small network of activities representing the delay event — is inserted into the most recent updated programme before the event, and the effect on completion is calculated.

- **Strengths:** uses the current, statused programme, so it reflects progress to date; well suited to prospective assessment when the event occurs.
- **Weaknesses:** depends heavily on the quality of the updated programme; a series of TIAs can be laborious.
- **Typical use:** contemporaneous extension-of-time requests, the change control process (see our guide to [project change control](/blog/project-change-control-process)).

### Windows analysis (time slice)

The project is divided into periods (windows), usually aligned with programme updates. In each window, the critical path and the movement of completion are analysed, and delay is attributed to events in that window.

- **Strengths:** follows the evolving critical path over time, using contemporaneous updates.
- **Weaknesses:** needs reliable, regular updates; poor-quality updates undermine it.
- **Typical use:** retrospective analysis on projects with good programme records.

### As-planned vs as-built

The planned and actual dates of activities are compared to identify where and when delays occurred, often along the as-built critical path. Variants analyse the comparison window by window.

- **Strengths:** intuitive, based on what actually happened.
- **Weaknesses:** requires good as-built records; identifying the as-built critical path involves judgement.
- **Typical use:** retrospective analysis where programme updates are poor but as-built records are good.

### Collapsed as-built (but-for)

An as-built programme is created, then delay events attributed to one party are removed to show when the project would have finished "but for" those events.

- **Strengths:** based on actual events; answers a clear question.
- **Weaknesses:** building a logic-linked as-built programme is laborious and involves assumptions.
- **Typical use:** retrospective analysis where no reliable contemporaneous programme exists.

## Comparing the methods

| Method | Uses baseline | Uses updates | Uses as-built | Prospective or retrospective |
|---|---|---|---|---|
| Impacted as-planned | Yes | No | No | Either (mostly early assessment) |
| Time impact analysis | No (uses latest update) | Yes | No | Mainly prospective |
| Windows / time slice | Yes | Yes | Partly | Retrospective |
| As-planned vs as-built | Yes | Optional | Yes | Retrospective |
| Collapsed as-built | No | No | Yes | Retrospective |

## Concurrency, float and other complications

Real delays rarely line up neatly. Three issues come up repeatedly:

- **Concurrent delay.** Two delays — one by each party — affect completion at the same time. How concurrency is treated depends on the contract and jurisdiction.
- **Float ownership.** Whether the employer or contractor "owns" float affects whether a delay that consumes float but does not delay completion gives entitlement. Contracts may define this.
- **Pacing.** A party may slow down non-critical work because the other party's delay has already moved the finish. Distinguishing pacing from genuine delay needs records.

These are legal as well as technical questions. The scheduler's role is to present the facts and the analysis clearly; entitlement is for the contract and, if necessary, the tribunal.

## Records that make or break an analysis

The quality of any delay analysis is limited by the quality of records. During the project, keep:

1. **An accepted baseline programme** with logic, calendars and a narrative of assumptions.
2. **Regular updates** with a fixed data date, statused properly, and with changes to logic recorded.
3. **Schedule quality checks** each update; our [DCMA 14-point assessment](/blog/dcma-14-point-schedule-assessment) guide and printable [schedule health check template (PDF)](/downloads/schedule-health-check-template.pdf) help here.
4. **Contemporaneous records** — site diaries, labour returns, photos, correspondence, meeting minutes, request-for-information logs and delivery records.
5. **Change and notice registers** linked to programme activities.
6. **Versioned schedule files** — never overwrite a past update.

A good analysis built on poor records will struggle; a modest analysis built on excellent records is often persuasive.

## A short worked example of a TIA

At update 9 (data date 1 March), a 20-month project forecasts completion on 30 November with two weeks of float on the path through roofing. On 5 March, the client instructs a change to the roof membrane, requiring redesign (15 working days) and new material procurement (25 working days) before roofing can resume.

The planner creates a fragnet: redesign → approval → procure membrane → resume roofing. Inserted into update 9, the path through roofing now extends 40 working days, consuming the two weeks of float and delaying completion by about 30 working days to mid-January. The TIA is submitted with the fragnet logic, durations and supporting evidence. Whether the full 30 days is granted then depends on the contract and on any concurrent contractor delay.

## Choosing a method: practical questions

When a delay analysis is needed, these questions narrow the choice quickly:

1. **What does the contract say?** Some contracts specify how delay must be demonstrated, or require prospective assessment at the time of the event.
2. **Is the analysis prospective or retrospective?** Time impact analysis suits events being assessed as they happen; windows and as-built methods suit look-back analyses.
3. **What records exist?** Regular, good-quality updates support windows analysis. Strong as-built records but poor updates point towards as-planned vs as-built or collapsed as-built approaches.
4. **How much time and budget is available?** Detailed windows or collapsed as-built analyses can take weeks of specialist effort. A proportionate method matters for smaller claims.
5. **What question must be answered?** "When would the project have finished but for the employer's delays?" and "What delayed the project in each period?" lead to different methods.

Agreeing the method early, and explaining why it was chosen, makes the analysis more persuasive and reduces arguments about methodology later.

## Where AI helps

AI tools can speed up delay analysis preparation: comparing many schedule versions, extracting dates from site diaries and correspondence, building chronologies and highlighting where the critical path shifted. They must be used with care, because analyses may be scrutinised in disputes: every AI-extracted fact needs verification against the source, and methods must be transparent and reproducible. Optimize All's free course [Project Controls with AI](/learn/project-controls-with-ai) covers scheduling fundamentals and governed AI.

## Building the skill

Delay analysis draws on scheduling, change control and governance — part of the integrated knowledge behind the [PCI AI](https://pciai.org) PCL-AI Project Controls Leader credential. See our [PCI AI partner page](/partners/pci-ai) for an overview.

## Frequently asked questions

### Which delay analysis method is best?

None is best in every case. The right method depends on the contract, the question, the records available and the time and budget for the analysis.

### What is a fragnet?

A fragment network: a small set of linked activities representing a delay event or change, inserted into a programme to measure its effect.

### Can delay analysis be done without a baseline programme?

Yes, with methods based on as-built records such as collapsed as-built, but it is harder and involves more assumptions.

### Do I need an expert for delay claims?

For significant claims or disputes, specialist delay analysts and legal advisers are usually involved. Project planners provide the records and often the first analysis.

---

*Optimize All is the official marketing partner of PCI AI and Certuvo.*
