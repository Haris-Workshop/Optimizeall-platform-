---
slug: ai-governance-policy-for-project-teams
title: AI Governance for Projects: A One-Page Policy Template
description: AI governance for projects made practical: a one-page policy template covering approved uses, data, sign-off and logging, plus a failure-mode register.
cluster: pci-ai
primaryKeyword: AI governance for projects
categories: project-controls
tags: ai governance, policy, project teams, risk register, guard framework, prompting
related: ai-in-project-controls, ai-prompts-for-project-managers, what-is-pcl-ai-certification, project-controls-kpis-dashboard, schedule-risk-analysis-monte-carlo, pml-ai-project-management-leader-certification
publishedDaysAgo: 55
cover: project-controls
coverAlt: Dark blue cover with a policy document and the words AI governance for projects
---
Most project teams are already using AI, whether or not anyone has told them they may. A scheduler pastes a task list into a chatbot to tidy the wording; a project manager asks a tool to summarise a long email chain; an analyst lets an assistant draft the monthly commentary. None of this is unreasonable, but without a policy nobody can say which data was shared, who checked the output or what the report would have said without the tool.

**AI governance for projects** does not need a committee or a fifty-page standard. It needs a one-page policy that people actually read, a short list of the ways AI fails and a log that makes work reviewable. This guide provides a template you can adapt, builds on the GUARD framework from [AI in project controls](/blog/ai-in-project-controls), and includes a failure-mode risk register.

## Why AI governance for projects fits on one page

Long policies are not read, and unread policies are not followed. A one-page policy forces choices, and those choices are the substance of governance. It should answer six questions:

1. Which tools may be used, and for what data?
2. Which tasks may AI do, assist or never do?
3. What must be checked before an output is used?
4. Who signs off?
5. What gets recorded?
6. What happens when something goes wrong?

Everything else, such as legal detail or technical standards, can sit in an appendix owned by your information security, legal or data protection specialists. This template is a starting point for a conversation with them, not a substitute for their advice. Nothing in this article is legal or compliance advice, and the thresholds, timescales and data classes shown are examples to adapt, not recommendations for any particular organisation or jurisdiction.

## A reminder of GUARD

The GUARD framework in our earlier post has five parts: Grant permission deliberately, Use documented inputs, Assess outputs against a baseline, Review by a named person and Disclose in the report. The template below turns each into policy wording.

## The one-page policy template

Adapt the wording, thresholds and tool names to your organisation. Items in capitals are fields to complete, and every timescale and classification below is an example value.

### 1. Purpose and scope

This policy applies to all use of AI tools in the PROJECT NAME team, including chat assistants, copilots and any feature embedded in project software. It exists so that AI speeds up our work without weakening accuracy, confidentiality or accountability.

### 2. Approved tools (Grant)

- Only tools on the approved register may be used for project work. The register lists each tool, its owner, the data classes it may process and the date of last review.
- Personal accounts and unapproved tools must not be used for project information.
- To request a tool, contact NAMED ROLE.

### 3. Data rules (Use)

| Data class | Examples | May be entered into approved AI tools? |
|---|---|---|
| Public | Published standards, public tender notices | Yes |
| Internal | Meeting agendas, generic templates, anonymised schedules | Yes, in approved tools only |
| Confidential | Cost rates, contract terms, supplier pricing, unreleased forecasts | Only in tools approved for this class |
| Restricted | Personal data, security information, legally privileged material | No |

When unsure, treat the data as one class higher and ask.

### 4. Approved uses (Use and Assess)

| Level | Meaning | Examples |
|---|---|---|
| AI may draft | A person must review and edit before use | Meeting notes, first-draft status commentary, risk wording, agendas |
| AI may assist | A person does the work and uses AI as a second pair of eyes | Checking a schedule narrative for gaps, suggesting questions for an estimator |
| AI must not decide | Decisions and sign-offs stay with named people | Baseline changes, forecast approval, contract positions, safety decisions |

### 5. Human sign-off (Review)

- Every AI-assisted output that informs a decision has a named reviewer.
- The reviewer checks numbers against source systems, not against the AI's own explanation.
- Reviewers confirm that no confidential data left approved tools.
- The reviewer is accountable for the output, whatever tool helped produce it.

### 6. Logging and disclosure (Disclose)

- Keep a simple AI use log: date, tool, purpose, data class, reviewer and outcome.
- Reports that include AI-assisted content say so in a line, for example "Commentary drafted with AI assistance and reviewed by NAME."
- Forecast and risk outputs state the method and compare against a simple conventional baseline.

### 7. Incidents and review

- Report suspected data exposure or material errors to NAMED ROLE within one working day (example timescale).
- The policy is reviewed every six months (example interval) and whenever tools or regulations change.

That is the page. The following sections explain how to make it work.

## A worked example: one log entry

This example uses fictional details. A project controls analyst uses an approved assistant to draft the monthly commentary from an anonymised extract of the cost report.

| Field | Entry |
|---|---|
| Date | Month-end |
| Tool | Approved assistant, internal data class |
| Purpose | Draft commentary on cost variance for the sponsor pack |
| Input | Anonymised variance table, no supplier names or rates |
| Check against baseline | Compared draft statements with the CPI-based forecast: draft claimed variance was "minor"; the source shows CPI of 0.88 |
| Outcome | Draft edited; sentence about "minor variance" removed; range added |
| Reviewer | Controls lead |

The entry took two minutes to write. It shows that the tool saved drafting time, that the baseline comparison caught a misleading phrase and that a named person reviewed the result. If a board asks later how a statement reached the pack, the log answers it.

## AI failure modes and a risk register

Governance is easier when you name how AI fails. The register below lists common failure modes in project settings, with a control for each. Scores are illustrative; rate likelihood and impact for your own context.

| Failure mode | What it looks like in a project | Illustrative rating | Control |
|---|---|---|---|
| Fabrication | A plausible but invented fact, such as a clause, a standard or a precedent | High | Verify every factual claim against source; require citations to documents provided |
| Arithmetic and logic slips | A wrong total or a mis-stated index | High | Recalculate in the controlled model; never accept a calculation unseen |
| Data leakage | Confidential rates or contract terms pasted into an unapproved tool | Medium | Approved register; data classes; training; tool restrictions |
| Stale or incomplete inputs | A summary based on last month's data or a partial extract | Medium | Record the data date and source; compare with the system of record |
| Overconfidence and false precision | An output states a single date or cost with no range | Medium | Require ranges and stated assumptions |
| Bias toward the prompt | The answer mirrors the leading question | Medium | Ask neutral questions; ask for counter-arguments |
| Automation complacency | Reviewers stop checking after several good results | Medium | Spot checks; rotate reviewers; keep the log |
| Unclear accountability | Nobody owns an AI-assisted forecast | Medium | Named reviewer on every output |
| Inconsistent use across the team | Different practices and unequal quality | Low to medium | One-page policy; short training; shared prompt library |

Review the register when something goes wrong, and add new failure modes as you discover them.

## Making the policy stick

- **Keep it to one page.** If it grows, move detail to an appendix.
- **Train people with real examples**, including the errors your own team has caught.
- **Make the safe path the easy path.** Provide approved tools and ready-made prompts so people are not tempted to improvise.
- **Review the log regularly.** Look for patterns: which tasks, which errors and which reviewers.
- **Treat reported errors as learning.** If people fear blame, they will stop reporting.

### Prompting standards belong in governance

Good governance includes good practice in how people ask. Standard prompts that restrict the model to provided evidence, request uncertainty to be stated and require output in a fixed format cut many failure modes at source. Optimize All's free courses [Prompt Engineering Foundations](/learn/prompt-engineering-foundations) and [Advanced Prompt Engineering](/learn/advanced-prompt-engineering) cover this in depth. For ten practical prompts with built-in checks, see [AI prompts for project managers](/blog/ai-prompts-for-project-managers).

## How this connects to forecasts and dashboards

Two areas deserve particular care. Forecasts are decision inputs, so the policy requires a conventional baseline comparison and a named reviewer; the principles in [schedule risk analysis](/blog/schedule-risk-analysis-monte-carlo) on ranges and stated assumptions apply to any AI-assisted forecast. Dashboards are read quickly and trusted widely, so every number on them should be traceable; see our [one-page KPI dashboard guide](/blog/project-controls-kpis-dashboard).

## Tools that help / Learn it properly

[PCI AI](https://pciai.org) describes its PCL-AI, PFL-AI and PML-AI exams as fully online and scenario-based, with AI governed throughout; its site holds the official detail. The policy template in this article is our own and is not drawn from PCI AI's materials. Our [PCI AI partner page](/partners/pci-ai) summarises the three credentials, and the [PML-AI certification guide](/blog/pml-ai-project-management-leader-certification) and [PCL-AI certification guide](/blog/what-is-pcl-ai-certification) show where governance fits. For practice in applying these ideas, Optimize All's free course [Project Controls with AI](/learn/project-controls-with-ai) is a natural companion.

## Frequently asked questions

### Do small teams need an AI policy?

Yes, although it can be very short. The risks of data leakage and unchecked outputs do not depend on team size, and a one-page policy takes little time to follow.

### Who should own the policy?

A named senior person such as the head of the PMO or controls lead, working with information security, legal and data protection specialists. Ownership matters more than the title.

### Does the policy need to name specific tools?

It should refer to an approved register that names tools, since tools change quickly. The policy text can stay stable while the register is updated.

### Is this template legal or compliance advice?

No. It is a practical starting point and not legal or compliance advice. Have your legal, security and data protection advisers review the final policy against your obligations, which differ by jurisdiction, sector and contract.

---

*Optimize All is the official marketing partner of PCI AI and Certuvo.*
