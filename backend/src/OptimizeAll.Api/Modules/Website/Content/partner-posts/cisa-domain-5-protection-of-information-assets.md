---
slug: cisa-domain-5-protection-of-information-assets
title: CISA Domain 5: Protecting Information Assets
description: CISA Domain 5 study guide: control types, access and encryption concepts at auditor level, how to test controls and a worked exam-style question.
cluster: certuvo
primaryKeyword: CISA domain 5
categories: exam-prep
tags: cisa, it audit, information security, controls, exam prep
related: cisa-exam-preparation-guide, cia-exam-preparation-guide, cia-part-1-essentials-of-internal-auditing, scenario-based-exam-questions-technique, how-to-review-a-mock-exam
publishedDaysAgo: 40
cover: exam-prep
coverAlt: Purple cover with amber accent bars and the words Certification exam prep
---
Candidates often find CISA Domain 5, Protection of Information Assets, the most intuitive domain and the most dangerous. It feels familiar because security is in the news and many of us have used firewalls, passwords and encryption. It is dangerous because the exam does not ask you to be a security engineer. It asks you to think like an auditor: what risk does this control address, how would I know it works, and what evidence would I need?

This guide explains how to study CISA Domain 5 at the right level, covers the main concept families, shows how auditors test controls and works through an exam-style question.

> The exam content outline, domain names, weightings, eligibility and fees are set by ISACA and are revised periodically. Check the official body's current requirements and exam content outline before you plan your study.

## The auditor's lens

The most useful mental shift is this: the exam is about assurance, not implementation. When a question describes a security measure, ask four things.

1. **What asset is being protected?** Data, systems, facilities or services.
2. **What risk is the control meant to reduce?** Unauthorised access, loss, disclosure, alteration or unavailability.
3. **Is the control suitable?** Is it preventive, detective or corrective, and does it match the risk?
4. **How would an auditor verify it?** What evidence would confirm it exists and operates effectively?

Answers that stay at the level of governance, risk and evidence are usually closer to what the exam rewards than answers that dive into technical configuration.

## Control types and how they combine

Controls are commonly grouped by their timing and their nature.

- **Preventive:** stop an event, such as access restrictions or input validation.
- **Detective:** identify an event after it occurs, such as logging and monitoring.
- **Corrective:** limit damage and restore, such as backup restoration and incident response.
- **Administrative, technical and physical:** policies and procedures, technology-based controls and physical safeguards respectively.

A strong security posture layers them: defence in depth. A scenario might ask which control best addresses a described gap. The best answer is usually the one that addresses the root cause, not merely the symptom, and that is proportionate to the risk.

## Access and identity concepts

Access control is a frequent theme. Be fluent in the ideas, not the product names.

- **Least privilege:** users get only the access needed for their role.
- **Segregation of duties:** no one person can complete a risky sequence alone, such as creating and approving a vendor.
- **Authentication and authorisation:** proving who you are versus deciding what you may do.
- **Multi-factor authentication:** combining something you know, have or are.
- **Access review and lifecycle:** granting, changing and removing access as people join, move and leave.
- **Privileged access:** administrator accounts need tighter control, logging and review.

An auditor's favourite red flags are generic or shared accounts, access that persists after a role change, and privileged activity that nobody reviews.

## Encryption and data protection at a conceptual level

Expect questions about why and where encryption is used, rather than algorithm detail.

- **Data at rest, in transit and in use** have different exposure points.
- **Symmetric encryption** uses one shared key and is efficient. **Asymmetric encryption** uses a key pair and supports exchanging keys and digital signatures.
- **Hashing** produces a fixed fingerprint used to check integrity; it is not reversible encryption.
- **Digital signatures** support authenticity, integrity and non-repudiation.
- **Key management** is often the weak point: who holds keys, how they are stored, rotated and recovered.

A good exam habit is to match the property to the need. If the question concerns proving that a document has not been altered, think integrity and hashing or signatures. If it concerns confidentiality in transit, think encryption of the channel.

## Network, endpoint and physical safeguards

Know the purpose of the common layers: firewalls and segmentation to control traffic, intrusion detection and prevention to spot and block suspicious activity, endpoint protection and patching to reduce vulnerabilities, and physical controls such as restricted areas and environmental safeguards. For each, know what risk it addresses and what an auditor would examine, such as rule sets, logs, patch reports or visitor records.

## Testing and evidence

Auditors do not simply accept that a control exists. Typical evidence approaches include:

- **Inquiry:** asking responsible staff. Useful, but the weakest form on its own.
- **Observation:** watching the control operate.
- **Inspection:** examining documents, configuration settings and logs.
- **Re-performance:** repeating the control to see if it yields the same result.

Questions often ask which procedure provides the most reliable evidence. As a rule, evidence obtained directly by the auditor and from independent sources is stronger than representations from the process owner. Re-performance and inspection of system-generated records generally outweigh inquiry alone.

## A worked question

The question below is **fictional and illustrative**.

*During an audit of Meridian Logistics, an IS auditor finds that 14 former employees still have active accounts on the order management system, three of which have been used since their departure dates. What should the auditor do FIRST?*

- A. Recommend a company-wide password reset.
- B. Determine the cause and the extent of the issue, including whether the unauthorised activity affected data or transactions.
- C. Disable all accounts that have not been used for 30 days.
- D. Conclude that the offboarding control is ineffective and close the testing.

Reasoning:

1. **Risk:** unauthorised access by former employees, with actual evidence of use.
2. **Control type:** this is a failure of the access lifecycle, specifically removal.
3. **Eliminate:** A is a blanket action that does not address the cause. C is a management decision and an arbitrary threshold. D stops too early, since the auditor has not assessed impact.
4. **Choose B.** The auditor should understand scope and consequence, and then report, which supports a well-evidenced finding and a targeted recommendation.

The pattern is typical of the domain: do not jump to a fix, and do not conclude before establishing facts.

## How to study the domain

- **Make a one-page grid** with control families down the side and columns for the risk addressed, the type of control and the evidence an auditor would seek.
- **Practise scenarios,** writing the risk before reading the options. See our guide to [scenario-based exam questions](/blog/scenario-based-exam-questions-technique).
- **Review errors by cause.** Did you misread, lack the concept or rush? The [mock exam review method](/blog/how-to-review-a-mock-exam) helps.
- **Link to the rest of the exam.** Domain 5 connects to governance, operations and acquisition domains, so revisit it as you study the others. Our [CISA exam preparation guide](/blog/cisa-exam-preparation-guide) lays out the full programme.

Candidates who come from general audit may also find it useful to compare the control vocabulary with [CIA Part 1](/blog/cia-part-1-essentials-of-internal-auditing) and the wider [CIA exam preparation guide](/blog/cia-exam-preparation-guide).

## Incident response, backup and resilience

Protecting assets includes preparing for the moment protection fails. Auditors look for evidence that the organisation can detect, respond and recover.

- **Incident management:** a defined process for identifying, classifying, escalating, containing and learning from incidents, with clear roles and a record of lessons learned.
- **Backup and recovery:** backups that are taken, stored separately from the production environment and, crucially, tested by actually restoring them. An untested backup is an assumption, not a control.
- **Logging and monitoring:** logs that are complete, protected from tampering and reviewed by someone with the authority to act.
- **Data classification and handling:** labels that tell staff how to treat information, together with retention and secure disposal rules.

A typical exam trap here is the control that exists on paper but has never been exercised. Where an option includes testing, review or evidence of operation, it often beats one that only describes a policy.

### A quick mapping drill

Take five controls you know from your own work, such as a visitor log, a firewall rule review, a quarterly access recertification, a data backup and a code-signing process. For each, write the asset, the risk, the control type and one piece of audit evidence. This takes about ten minutes and builds exactly the reflex the exam rewards. The table below shows one **illustrative** row set.

| Control | Risk addressed | Type | Evidence an auditor might seek |
|---|---|---|---|
| Quarterly access recertification | Excess or stale access | Detective | Signed review records and resulting removals |
| Restore test of nightly backups | Data loss, failed recovery | Corrective | Restore logs and test results |
| Firewall rule review | Unauthorised network traffic | Preventive | Rule set extract and review sign-off |

## Tools that help / Learn it properly

[Certuvo](https://certuvo.com) prepares candidates for the CISA with exam-style questions written and verified by qualified professionals and mapped to the official blueprint, with every question validated by four independent AI judges. Its AI Coach, available by chat or voice call during practice, teaches you to think rather than memorise, can read the question, diagrams and answer options on your screen, and references frameworks such as COBIT 2019. It is automatically disabled during mock exams. See the [Certuvo partner page](/partners/certuvo).

For general technique, Optimize All's free course [Professional Certification Exam Success](/learn/professional-certification-exam-success) covers study planning and exam approach.

## Frequently asked questions

### Do I need a deep technical background for Domain 5?

No. You need to understand concepts and what they protect against, and to reason like an auditor about evidence. Hands-on technical depth helps but is not the target.

### What is the most common mistake in Domain 5 questions?

Choosing a technically impressive answer instead of the one that addresses the stated risk. Always identify the asset, the risk and the control type before looking at the options.

### How do I remember encryption concepts?

Link each concept to the property it provides: confidentiality, integrity, authenticity or non-repudiation. Then practise matching a scenario to the property.

### Where should I check the current domain weightings?

On ISACA's official website, in the current exam content outline.

---

*Optimize All is the official marketing partner of PCI AI and Certuvo.*
