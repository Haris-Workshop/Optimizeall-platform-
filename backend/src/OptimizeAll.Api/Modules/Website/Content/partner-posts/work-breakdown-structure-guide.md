---
slug: work-breakdown-structure-guide
title: Work Breakdown Structure: How to Build One That Works
description: A practical guide to the work breakdown structure: the 100% rule, levels, WBS dictionary, control accounts and a worked example you can adapt.
cluster: pci-ai
primaryKeyword: work breakdown structure
categories: project-controls
tags: wbs, scope, planning, control accounts, project controls
related: how-to-build-a-cost-baseline, what-is-project-controls, critical-path-method-explained, earned-value-management-explained, progress-measurement-methods, project-change-control-process
publishedDaysAgo: 59
cover: project-controls
coverAlt: Dark blue cover with horizontal schedule bars and the words Project controls and finance
---
Every serious project control system starts with the same question: **what exactly are we delivering?** The work breakdown structure (WBS) is how you answer it. It decomposes the total scope of a project into smaller, manageable pieces, so that each piece can be estimated, scheduled, assigned, measured and controlled.

A good WBS makes everything downstream easier: the schedule hangs off it, the cost estimate rolls up through it, earned value is measured against it and change control references it. A poor one causes trouble for years — costs that cannot be traced to work, progress that cannot be measured and scope that quietly grows. This guide explains the principles, shows a worked example and finishes with the mistakes that cause most WBS problems.

## What a work breakdown structure is (and is not)

A WBS is a **hierarchical decomposition of the deliverables and work** required to achieve the project objectives. The top level is the whole project. Each level below breaks its parent into smaller components until you reach **work packages**: units small enough to estimate, schedule and assign to one accountable owner.

A WBS is not:

- **A schedule.** It has no sequence or dates. The schedule is built from the work packages, but the WBS itself says *what*, not *when*.
- **An organisation chart.** That is the organisational breakdown structure (OBS). The two meet in the responsibility matrix.
- **A list of activities.** Activities ("pour", "test", "review") belong in the schedule. WBS elements are usually nouns — deliverables or components.

## The 100% rule

The single most important principle is the **100% rule**: the WBS includes all of the work defined by the project scope — internal, external and contracted work, including project management itself — and nothing more. At every level, the children of an element must add up to exactly 100% of the parent.

Two consequences follow:

1. **Nothing is missing.** If commissioning, training or documentation is in scope, it has a home in the WBS. Work without a home tends to be unbudgeted.
2. **Nothing overlaps.** If "electrical installation" appears under both "Building A" and "Systems", the same work will be estimated twice and progress will be claimed twice.

## Choosing how to decompose

There is no single correct structure. Common options for the second level include:

| Decomposition basis | Example level 2 | Works well when |
|---|---|---|
| Deliverable or product | Building A, Building B, External works | Physical assets with clear boundaries |
| System | Civil, mechanical, electrical, controls | Process plants and systems-heavy projects |
| Phase | Design, procurement, construction, commissioning | Projects managed in strict stages |
| Location or area | Zone 1, Zone 2, Tunnel section 3 | Linear or geographically spread work |

Many projects combine bases at different levels — for instance, area at level 2 and discipline at level 3. The rule of thumb is to choose the structure that matches **how the work will be managed and reported**, and to keep it consistent. If the client wants reports by building but you structure by discipline, every report becomes a manual re-mapping exercise.

## How deep should you go?

Decompose until each work package:

- can be estimated with a stated basis of estimate;
- can be scheduled with a duration you can defend;
- has one accountable owner;
- has a clear way to measure progress (see our guide to [progress measurement methods](/blog/progress-measurement-methods));
- is small enough that problems show up within one or two reporting periods.

On many projects that means work packages that take a few weeks to a couple of months and cost a small percentage of the total. There is no universal size: what matters is that progress and cost can be tracked meaningfully.

## Control accounts: where scope, schedule and cost meet

Between the top of the WBS and the work packages sits a management layer called the **control account**. A control account is the intersection of a WBS element and an organisational owner (the control account manager). It is where budget is assigned, where actual cost is collected and where earned value is compared with planned value and actual cost.

The control account level is a design decision. Too high, and variances average out and hide problems. Too low, and you drown in reporting. Our guide to [building a cost baseline](/blog/how-to-build-a-cost-baseline) explains how budgets are time-phased into control accounts, and [earned value management explained](/blog/earned-value-management-explained) shows how they are measured.

## The WBS dictionary

A WBS without a dictionary is a list of labels open to interpretation. The **WBS dictionary** gives each element a short, controlled description. A practical template for each work package includes:

- WBS code and name;
- description of the scope and the deliverable;
- inclusions and explicit exclusions;
- acceptance criteria;
- accountable owner and control account;
- key assumptions and interfaces;
- the basis of estimate reference;
- the progress measurement method (rules of credit).

Writing the exclusions is the most valuable line. "Includes installation and testing; excludes commissioning, which sits in 5.3" prevents months of arguments.

## A worked example: a small office fit-out

A company is fitting out two floors of an office building. A deliverable-based WBS might look like this:

```
1   Office fit-out programme
1.1 Project management
    1.1.1 Planning and controls
    1.1.2 Procurement management
1.2 Level 3 fit-out
    1.2.1 Partitions and ceilings
    1.2.2 Mechanical and electrical installation
    1.2.3 Finishes and furniture
1.3 Level 4 fit-out
    1.3.1 Partitions and ceilings
    1.3.2 Mechanical and electrical installation
    1.3.3 Finishes and furniture
1.4 IT and audiovisual
    1.4.1 Network and cabling
    1.4.2 Meeting room AV
1.5 Handover
    1.5.1 Testing and commissioning
    1.5.2 Documentation and training
```

Check it against the 100% rule. Is commissioning anywhere? Yes, in 1.5.1. Is move-in logistics in scope? If so, it is missing and needs a home — perhaps 1.5.3. Is IT cabling also included in 1.2.2? If the electrical contractor is also pulling data cables, the scope overlaps and one of the elements needs an exclusion.

Notice that project management itself has an element (1.1). Leaving it out is a classic mistake: the work is real and costs money.

## Common mistakes

- **Activities instead of deliverables.** "Design", "Build", "Test" at every level creates a WBS that is really a schedule in disguise.
- **Mirroring the cost ledger.** Accounting codes ("labour", "materials") are cost elements, not scope. They belong in a cost breakdown structure mapped to the WBS.
- **Changing the structure mid-project.** Reorganising the WBS after baseline breaks history. If you must, do it through formal [change control](/blog/project-change-control-process) and map old codes to new.
- **Too many levels.** Five or six levels is plenty for most projects. Deeper structures are rarely maintained.
- **No dictionary.** Labels alone invite overlapping interpretations.

## A quick WBS review checklist

Before baselining, walk through these questions with the delivery team:

- Do the level 2 elements match how the client and sponsor want progress reported?
- Does every element have a dictionary entry with explicit exclusions?
- Is project management, commissioning, training and documentation included?
- Can every work package be measured with an agreed method?
- Does each control account have one named owner?
- Do the WBS codes map cleanly to the cost ledger and the schedule activity codes?

## Where AI can help

AI assistants are useful for a first draft: given a scope statement, they can propose a decomposition, draft dictionary entries and flag likely gaps such as commissioning, training, permits or project management. They are also good at consistency checks — spotting elements described with activities rather than deliverables or entries missing exclusions. The planner still owns the structure; treat the draft as a starting point to challenge with the people who will deliver the work. Optimize All's free course [Project Controls with AI](/learn/project-controls-with-ai) includes WBS exercises and prompt templates for this.

## Building the discipline

The WBS is the foundation of integrated project controls: scope, schedule and cost all reference it. It sits within the planning knowledge behind the [PCI AI](https://pciai.org) PCL-AI Project Controls Leader credential; see our [PCI AI partner page](/partners/pci-ai) for an overview of PCI AI's certifications, and the official site for the current body of knowledge.

## Frequently asked questions

### What is the difference between a WBS and a work package?

The WBS is the whole hierarchy. Work packages are the lowest-level elements, where work is estimated, scheduled, assigned and measured.

### Should the WBS be organised by phase or by deliverable?

Either can work. Deliverable-based structures usually make scope gaps easier to spot, while phase-based structures suit strictly staged projects. Choose the basis that matches how the work will be managed and reported, and stay consistent.

### Who should create the WBS?

The project manager or controls lead usually facilitates it, but it should be built with the people who will deliver the work. Their input surfaces missing scope and unrealistic boundaries.

### How does the WBS relate to earned value?

Budgets are assigned to control accounts and work packages in the WBS, and earned value is measured against them. Without a clear WBS, earned value has nothing reliable to measure.

---

*Optimize All is the official marketing partner of PCI AI and Certuvo.*
