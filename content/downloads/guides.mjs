// Content of the free PDF guides served at /downloads/{file}.pdf (built by build.mjs). Each guide is linked from at
// least two partner blog posts (backend PartnerPostLibrary.Downloads) and from the hub post
// /blog/free-project-controls-and-exam-prep-guides. Keep facts in line with those posts: exam rules come from the
// awarding bodies' public information and readers are always told to confirm the current details with them.

/** @param {string} site absolute origin of the website, e.g. https://www.optimizeall.com */
export function guides(site) {
  const u = (path) => `${site}${path}`;
  const a = (path, text) => `<a href="${u(path)}">${text}</a>`;
  const pci = '<a href="https://pciai.org">pciai.org</a>';
  const certuvo = '<a href="https://certuvo.com">certuvo.com</a>';

  return [
    {
      file: 'earned-value-management-cheat-sheet',
      title: 'Earned Value Management Cheat Sheet',
      subject: 'Earned value management formulas, interpretation, EAC methods, rules of credit and a health check on two pages.',
      keywords: ['earned value management', 'EVM formulas', 'CPI', 'SPI', 'estimate at completion', 'TCPI', 'project controls', 'PCL-AI'],
      kicker: 'Project controls · Free guide',
      intro: `The formulas, how to read them and the checks to run before you trust them. Full explanation and a worked example: ${a('/blog/earned-value-management-explained', 'Earned value management explained')}.`,
      partners: 'pci',
      body: `
<h2>The core values</h2>
<table>
<tr><th style="width:24%">Term</th><th>Meaning</th></tr>
<tr><td><b>PV</b> planned value (BCWS)</td><td>Budgeted cost of the work <i>scheduled</i> to be done by the data date.</td></tr>
<tr><td><b>EV</b> earned value (BCWP)</td><td>Budgeted cost of the work <i>actually completed</i> by the data date, measured by agreed rules of credit.</td></tr>
<tr><td><b>AC</b> actual cost (ACWP)</td><td>Cost actually incurred for the completed work, including accruals for work done but not yet invoiced.</td></tr>
<tr><td><b>BAC</b> budget at completion</td><td>Total approved budget for the work (the end point of the PV curve).</td></tr>
<tr><td><b>EAC</b> estimate at completion</td><td>Expected total cost when the work is finished.</td></tr>
</table>

<h2>Variances and indices</h2>
<table>
<tr><th>Measure</th><th>Formula</th><th>Reading</th></tr>
<tr><td>Cost variance (CV)</td><td class="formula">EV − AC</td><td>Negative = over cost for the work achieved</td></tr>
<tr><td>Schedule variance (SV)</td><td class="formula">EV − PV</td><td>Negative = behind plan (in value terms)</td></tr>
<tr><td>Cost performance index (CPI)</td><td class="formula">EV ÷ AC</td><td>Below 1.0 = each unit spent earns less than planned</td></tr>
<tr><td>Schedule performance index (SPI)</td><td class="formula">EV ÷ PV</td><td>Below 1.0 = progressing slower than planned</td></tr>
<tr><td>Percent complete</td><td class="formula">EV ÷ BAC</td><td>Achievement — not the same as percent spent</td></tr>
<tr><td>Percent spent</td><td class="formula">AC ÷ BAC</td><td>Spend — compare with percent complete</td></tr>
</table>

<h2>Forecasting</h2>
<table>
<tr><th>Method</th><th>Formula</th><th>Use when</th></tr>
<tr><td>EAC — CPI method</td><td class="formula">BAC ÷ CPI</td><td>Current cost efficiency is expected to continue</td></tr>
<tr><td>EAC — CPI × SPI method</td><td class="formula">AC + (BAC − EV) ÷ (CPI × SPI)</td><td>Schedule pressure will also drive cost</td></tr>
<tr><td>EAC — remaining at budget</td><td class="formula">AC + (BAC − EV)</td><td>The cause of past variance will not recur</td></tr>
<tr><td>EAC — bottom-up</td><td class="formula">AC + new estimate to complete</td><td>Original assumptions no longer hold</td></tr>
<tr><td>Variance at completion (VAC)</td><td class="formula">BAC − EAC</td><td>Negative = forecast overrun</td></tr>
<tr><td>To-complete performance index (TCPI)</td><td class="formula">(BAC − EV) ÷ (BAC − AC)</td><td>Efficiency needed on remaining work to finish on budget</td></tr>
</table>
<p class="small">Present two or three methods as a range and say which one you recommend and why. More detail: ${a('/blog/estimate-at-completion-formulas', 'Estimate at completion formulas')}.</p>

<h2>Rules of credit (progress measurement)</h2>
<div class="cols">
<div><ul>
<li><b>Units complete</b> — counted quantities (metres, drawings, units).</li>
<li><b>Weighted milestones</b> — agreed steps, e.g. received 10%, installed 40%, connected 25%, tested 15%, commissioned 10%.</li>
<li><b>0/100, 50/50, 25/75</b> — short activities only (one or two periods).</li>
</ul></div>
<div><ul>
<li><b>Percent complete</b> — estimated; pair with evidence and caps.</li>
<li><b>Level of effort</b> — support work; always SPI 1.0, so keep it small.</li>
<li><b>Apportioned effort</b> — tied to the work it supports (e.g. inspection).</li>
</ul></div>
</div>
<p class="small">Agree the method before work starts and phase the baseline the same way. Guide: ${a('/blog/progress-measurement-methods', 'Progress measurement methods')}.</p>

<h2>Worked mini-example</h2>
<div class="box"><p class="formula">BAC 2,000,000 · PV 1,000,000 · EV 930,000 · AC 1,050,000<br>
CV = −120,000 · SV = −70,000 · CPI = 0.886 · SPI = 0.930<br>
EAC (CPI) ≈ 2,257,000 · EAC (CPI × SPI) ≈ 2,348,000 · TCPI ≈ 1.126</p>
<p>Reading: cost efficiency is about 89%; to finish on budget the remaining work must run at a CPI of about 1.13 — usually a sign a formal re-forecast is needed.</p></div>

<h2>Five-question health check — before you present CPI or SPI</h2>
<ul class="check">
<li>Were rules of credit agreed before work started, and is progress evidenced?</li>
<li>Does AC include accruals for work done but not yet invoiced?</li>
<li>Is the baseline current and approved, with changes only through change control?</li>
<li>Is level-of-effort work separated from discrete work?</li>
<li>Late in the project, is SPI supplemented by earned schedule or critical-path analysis?</li>
</ul>

<h2>Common traps</h2>
<ul>
<li>Confusing percent spent with percent complete.</li>
<li>Building PV from a budget spread evenly instead of from the schedule.</li>
<li>Re-baselining to remove variances caused by poor performance.</li>
<li>Reporting one month's index without the trend.</li>
</ul>
<p class="small">Related reading: ${a('/blog/s-curve-project-management', 'The S-curve in project management')} · ${a('/blog/how-to-build-a-cost-baseline', 'How to build a cost baseline')} · ${a('/blog/earned-schedule-explained', 'Earned schedule explained')}.</p>`,
    },

    {
      file: 'schedule-health-check-template',
      title: 'Schedule Health Check Template',
      subject: 'A printable DCMA 14-point schedule assessment template with commonly quoted thresholds, a review workflow and sign-off.',
      keywords: ['DCMA 14-point assessment', 'schedule health check', 'schedule quality', 'critical path', 'project scheduling', 'project controls'],
      kicker: 'Project controls · Free template',
      intro: `Run it at baseline and at every update; keep the completed sheets to see trends. Full guide: ${a('/blog/dcma-14-point-schedule-assessment', 'DCMA 14-point assessment')}.`,
      partners: 'pci',
      body: `
<table>
<tr><th style="width:28%">Project / schedule</th><td></td><th style="width:16%">Data date</th><td style="width:18%"></td></tr>
<tr><th>Population checked</th><td colspan="3" class="small">Incomplete normal activities, excluding milestones, summaries and level of effort (state exclusions): </td></tr>
</table>

<h2>The fourteen checks</h2>
<p class="small">Thresholds are those commonly quoted for the DCMA 14-point assessment. Your contract or procedures may set different ones — use those.</p>
<table>
<tr><th style="width:4%">#</th><th style="width:17%">Check</th><th style="width:27%">Looks for</th><th style="width:16%">Common threshold</th><th style="width:9%">Result</th><th style="width:7%">Pass?</th><th>Justification / action</th></tr>
<tr><td>1</td><td>Logic</td><td>Missing predecessor or successor</td><td>≤ 5%</td><td></td><td></td><td></td></tr>
<tr><td>2</td><td>Leads</td><td>Negative lags</td><td>0%</td><td></td><td></td><td></td></tr>
<tr><td>3</td><td>Lags</td><td>Positive lags</td><td>≤ 5%</td><td></td><td></td><td></td></tr>
<tr><td>4</td><td>Relationship types</td><td>Share of finish-to-start links</td><td>≥ 90% FS</td><td></td><td></td><td></td></tr>
<tr><td>5</td><td>Hard constraints</td><td>Constraints overriding logic</td><td>≤ 5%</td><td></td><td></td><td></td></tr>
<tr><td>6</td><td>High float</td><td>Total float over 44 working days</td><td>≤ 5%</td><td></td><td></td><td></td></tr>
<tr><td>7</td><td>Negative float</td><td>Total float below zero</td><td>0%</td><td></td><td></td><td></td></tr>
<tr><td>8</td><td>High duration</td><td>Remaining duration over 44 working days</td><td>≤ 5%</td><td></td><td></td><td></td></tr>
<tr><td>9</td><td>Invalid dates</td><td>Forecasts before / actuals after data date</td><td>0%</td><td></td><td></td><td></td></tr>
<tr><td>10</td><td>Resources</td><td>Activities without resources or cost</td><td>Informational</td><td></td><td></td><td></td></tr>
<tr><td>11</td><td>Missed tasks</td><td>Should have finished by data date, did not</td><td>≤ 5%</td><td></td><td></td><td></td></tr>
<tr><td>12</td><td>Critical path test</td><td>Finish responds one-for-one to added delay</td><td>Pass</td><td></td><td></td><td></td></tr>
<tr><td>13</td><td>CPLI</td><td>(CP length + total float) ÷ CP length</td><td>≥ 0.95</td><td></td><td></td><td></td></tr>
<tr><td>14</td><td>BEI</td><td>Tasks completed ÷ tasks due</td><td>≥ 0.95</td><td></td><td></td><td></td></tr>
</table>

<h2>Review workflow</h2>
<ol>
<li><b>Freeze a copy</b> of the statused schedule at the data date.</li>
<li><b>Define the population</b> and record the exclusions.</li>
<li><b>Run the checks</b> and keep the activity lists, not only the percentages.</li>
<li><b>Triage failures</b> by float and proximity to the critical path; fix what matters first (usually missing logic).</li>
<li><b>Record justifications</b> for legitimate exceptions (long-lead items, contractual milestones).</li>
<li><b>Re-run and compare</b> with previous updates; report the trend.</li>
</ol>

<div class="box amber"><b>Remember:</b> passing all fourteen checks does not prove the schedule is realistic. Walk the critical path with the people doing the work. Before levelling resources, fix logic first — see ${a('/blog/resource-levelling-explained', 'Resource levelling explained')}; for claims, good update records underpin ${a('/blog/delay-analysis-methods', 'delay analysis')}.</div>

<h2>Trend tracker</h2>
<table>
<tr><th>Update</th><th>Logic %</th><th>Constraints %</th><th>High float %</th><th>Neg. float %</th><th>Missed %</th><th>CPLI</th><th>BEI</th></tr>
<tr><td class="blank"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td class="blank"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td class="blank"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td class="blank"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
</table>

<h2>Sign-off</h2>
<table>
<tr><th style="width:25%">Planner</th><td></td><th style="width:12%">Date</th><td style="width:18%"></td></tr>
<tr><th>Reviewer</th><td></td><th>Date</th><td></td></tr>
</table>`,
    },

    {
      file: 'ai-in-project-controls-playbook',
      title: 'AI in Project Controls: A Practical Playbook',
      subject: 'Use cases, governance checklist, prompt patterns, review workflow and a 30-day pilot plan for using AI in project controls responsibly.',
      keywords: ['AI in project controls', 'AI for project scheduling', 'AI cost forecasting', 'AI governance', 'project controls', 'PCL-AI'],
      kicker: 'Project controls · Free playbook',
      intro: `How to get real value from AI in scheduling, cost, forecasting and reporting — with the governance that keeps the numbers defensible. Background: ${a('/blog/ai-in-project-controls', 'AI in project controls')}.`,
      partners: 'pci',
      body: `
<h2>1. Use cases and the review they need</h2>
<table>
<tr><th style="width:18%">Area</th><th>Good uses today</th><th style="width:28%">Keep a human on</th><th style="width:11%">Review level</th></tr>
<tr><td>Scheduling</td><td>Draft activity lists from scope; compare updates; group quality-check failures; suggest likely missing links</td><td>Logic, durations, baseline changes</td><td>High</td></tr>
<tr><td>Schedule quality</td><td>Run and summarise DCMA-style checks every update</td><td>Accepting exceptions</td><td>Medium</td></tr>
<tr><td>Cost</td><td>Map cost lines to control accounts; flag unusual postings and missing accruals</td><td>Corrections to the ledger</td><td>Medium</td></tr>
<tr><td>Forecasting</td><td>Pattern-based EAC ranges from your history; driver analysis; scenarios</td><td>The reported EAC and its basis</td><td>High</td></tr>
<tr><td>Risk</td><td>De-duplicate registers; draft risk descriptions; summarise trends</td><td>Probability, impact, contingency</td><td>High</td></tr>
<tr><td>Progress</td><td>Cross-check claims against deliveries, inspections and photos</td><td>Rules of credit; accepted progress</td><td>High</td></tr>
<tr><td>Reporting</td><td>Draft narratives from verified data; consistency checks across sections</td><td>Causes, actions, recommendations</td><td>Medium</td></tr>
</table>

<h2>2. Governance checklist — agree before using AI on live data</h2>
<ul class="check">
<li><b>Allowed uses</b> written down (e.g. drafting, review, narrative: yes; automatic baseline changes: no).</li>
<li><b>Approved tools</b> and <b>data handling</b>: which data may be sent to which tool; where it is stored.</li>
<li><b>Human review</b>: every AI-proposed change to logic, durations, forecasts or progress is approved by a named person.</li>
<li><b>Labelling</b>: AI-assisted sections of reports are marked as such.</li>
<li><b>Audit trail</b>: inputs, prompts or model versions and reviewer decisions are recorded.</li>
<li><b>Validation</b>: predictions are compared with outcomes; features that do not help are dropped.</li>
<li><b>Fallback</b>: the team can still produce the update and report without the tool.</li>
</ul>
<p class="small">Turn this into a team policy with ${a('/blog/ai-governance-policy-for-project-teams', 'our AI governance policy template')}.</p>

<h2>3. Prompt patterns that stay grounded</h2>
<div class="box">
<p><b>Use only the data provided:</b> “Using only the attached export, list activities whose finish moved by more than 10 working days, grouped by WBS, with old and new dates. Say if anything is missing.”</p>
<p><b>Explain, then flag uncertainty:</b> “Draft a 150-word explanation of what drives the finish date. Mark any statement you could not verify from the data.”</p>
<p><b>Check, don't change:</b> “List activities without successors (excluding the finish milestone) and suggest which might need a link to handover. Do not propose durations.”</p>
<p><b>Compare with the formulas:</b> “Compare this forecast with BAC ÷ CPI and AC + (BAC − EV) ÷ (CPI × SPI). Explain any gap above 3%.”</p>
</div>
<p class="small">More prompts: ${a('/blog/ai-prompts-for-project-managers', 'AI prompts for project managers')}.</p>

<h2>4. Review workflow for AI-assisted reports</h2>
<ol>
<li>Produce the numbers from controlled systems (schedule, cost ledger, risk register).</li>
<li>Run automated checks; fix data problems first.</li>
<li>Ask the AI to compare, summarise and draft — from the verified data only.</li>
<li>Control account managers correct causes and actions; the AI cannot know why work slipped.</li>
<li>Label AI-assisted content; a named owner signs off the report.</li>
</ol>

<h2>5. A 30-day pilot plan</h2>
<table>
<tr><th style="width:14%">Week</th><th>What to do</th></tr>
<tr><td>1 — baseline</td><td>Pick one project and one use case. Record how long the task takes today and what it usually finds.</td></tr>
<tr><td>2 — set up</td><td>Confirm the tool is approved for the data; write allowed uses; name the reviewer.</td></tr>
<tr><td>3 — run in parallel</td><td>Do the task both ways. Compare time, issues found, false alarms and errors.</td></tr>
<tr><td>4 — decide</td><td>Keep, adjust or drop. If kept, document the workflow and review step.</td></tr>
</table>

<h2>6. Measures of success</h2>
<ul>
<li>Hours saved per reporting cycle, with quality unchanged or better.</li>
<li>Genuine issues found that the old process missed.</li>
<li>Forecast accuracy against outcomes (back-tested on completed projects).</li>
<li>Zero unreviewed AI changes to baselines or reported numbers.</li>
</ul>
<p class="small">Deeper dives: ${a('/blog/ai-for-project-scheduling', 'AI for project scheduling')} · ${a('/blog/ai-cost-forecasting-for-projects', 'AI cost forecasting')} · ${a('/blog/project-controls-monthly-report', 'Project controls monthly report')}.</p>`,
    },

    {
      file: 'choosing-a-project-controls-certification',
      title: 'Choosing a Project Controls Certification',
      subject: 'A worksheet for comparing PCI AI PCL-AI, AACE International and PMI credentials and choosing the right project controls certification.',
      keywords: ['project controls certification', 'PCL-AI', 'PCI AI', 'AACE CCP', 'PSP', 'EVP', 'PMI-SP', 'PMI-RMP', 'PMP'],
      kicker: 'Careers · Free worksheet',
      intro: `An overview of the main routes and a five-question worksheet to choose yours. Requirements change — confirm everything with the awarding body. Full comparison: ${a('/blog/project-controls-certifications-compared', 'Project controls certification: PCL-AI, AACE and PMI')}.`,
      partners: 'both',
      body: `
<h2>The landscape</h2>
<table>
<tr><th style="width:14%">Credential</th><th style="width:17%">Awarding body</th><th>Scope</th><th style="width:25%">Typical candidate</th></tr>
<tr><td><b>PCL-AI</b></td><td>PCI AI</td><td>Integrated controls: planning, scheduling, cost, earned value, forecasting, risk, project finance, with governed AI throughout</td><td>Controls professionals and leaders</td></tr>
<tr><td>PFL-AI / PML-AI</td><td>PCI AI</td><td>Project finance leadership / project management leadership with AI</td><td>Finance and delivery leaders</td></tr>
<tr><td>CCP</td><td>AACE International</td><td>Broad cost engineering</td><td>Experienced cost professionals</td></tr>
<tr><td>PSP</td><td>AACE International</td><td>Planning and scheduling</td><td>Experienced planners</td></tr>
<tr><td>EVP</td><td>AACE International</td><td>Earned value</td><td>EVM specialists</td></tr>
<tr><td>PMI-SP</td><td>PMI</td><td>Scheduling</td><td>Schedulers in PMI-aligned organisations</td></tr>
<tr><td>PMI-RMP</td><td>PMI</td><td>Risk management</td><td>Risk specialists</td></tr>
<tr><td>PMP</td><td>PMI</td><td>General project management</td><td>Project managers</td></tr>
</table>

<div class="box"><b>PCI AI's published facts (check ${pci} for current details):</b> PCL-AI is open to anyone with three years' experience in any field; every PCI AI exam is fully online and scenario-based, 90 minutes, 65% to pass, USD 350 exam fee, credential valid for three years. AACE International and PMI publish eligibility, exam and recertification rules in their own handbooks.</div>

<h2>Five-question worksheet</h2>
<table>
<tr><th style="width:38%">Question</th><th>Your answer</th></tr>
<tr><td>1. What will your role look like in two years — leading a controls function, or a deep specialist?</td><td class="blank"></td></tr>
<tr><td>2. Which credentials appear in 20 job adverts for your target role? (tally)</td><td class="blank"></td></tr>
<tr><td>3. Which eligibility requirements can you evidence today?</td><td class="blank"></td></tr>
<tr><td>4. How do you learn best — applied scenarios or structured reading?</td><td class="blank"></td></tr>
<tr><td>5. How much will AI feature in your next role, and does the credential test governed AI use?</td><td class="blank"></td></tr>
</table>

<h2>Before you register — tick when answered</h2>
<ul class="check">
<li>I meet the eligibility rules today and can document them if audited.</li>
<li>I have read the official body of knowledge or exam content outline and rated myself on each topic.</li>
<li>I know the format: online or test centre, duration, question style; I have tried official sample questions.</li>
<li>I know what maintaining the credential requires and over what cycle.</li>
<li>Employers in my sector and region recognise it.</li>
<li>I can protect regular study time for the next two to three months.</li>
</ul>

<h2>A common sequence</h2>
<ol>
<li><b>Early career:</b> build scheduling, cost and earned value fundamentals at work and through structured learning.</li>
<li><b>Three to five years:</b> an integrated or specialist credential that matches your role.</li>
<li><b>Later:</b> a second credential that fills a gap (management, finance or risk) rather than one that overlaps.</li>
</ol>
<p class="small">Related: ${a('/blog/pmp-vs-pcl-ai', 'PMP vs PCL-AI')} · ${a('/blog/what-is-pcl-ai-certification', 'PCL-AI certification')} · ${a('/blog/project-controls-interview-questions', 'Project controls interview questions')} · ${a('/partners/pci-ai', 'PCI AI partner page')}.</p>`,
    },

    {
      file: 'pmp-study-plan-8-week-checklist',
      title: 'PMP Study Plan: 8-Week Checklist',
      subject: 'A printable 8-week PMP study plan for working professionals with weekly goals, routines, a review method and an error log.',
      keywords: ['PMP study plan', 'PMP exam prep', 'PMP practice questions', 'PMP 2026', 'project management certification', 'Certuvo'],
      kicker: 'Exam prep · Free checklist',
      intro: `About 8–10 hours a week for eight weeks; stretch to twelve if you need to. Check PMI's current eligibility rules and exam content outline first. Full guide: ${a('/blog/pmp-study-plan', 'PMP study plan')}.`,
      partners: 'certuvo',
      body: `
<h2>Typical week</h2>
<table>
<tr><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Sun</th></tr>
<tr><td>60 min learn</td><td>60 min questions + review</td><td>60 min learn</td><td>60 min questions + error log</td><td>30 min spaced review</td><td>2–3 h mixed timed set + deep review</td><td>Rest or light review</td></tr>
</table>

<h2>Weekly checklist</h2>
<h3>Week 1 — Orientation</h3>
<ul class="check"><li>Download and read PMI's current exam content outline (updated July 2026).</li><li>Audit study materials: do they match the current outline?</li><li>Diagnostic quiz; set up the error log; block study time in the calendar.</li></ul>
<h3>Week 2 — Foundations of delivery</h3>
<ul class="check"><li>Principles, value delivery, project environment.</li><li>Development approaches: predictive, agile, hybrid — when each fits.</li><li>15–20 questions per session with full review.</li></ul>
<h3>Week 3 — People</h3>
<ul class="check"><li>Leadership, conflict, team performance, stakeholder engagement.</li><li>Situational questions: what should the project manager do first?</li><li>About 100 questions with full review.</li></ul>
<h3>Week 4 — Process: planning and delivery</h3>
<ul class="check"><li>Scope, schedule, cost, quality, resources, procurement, risk, communications.</li><li>Core calculations (e.g. earned value, critical path) — and their interpretation.</li><li>About 120 questions.</li></ul>
<h3>Week 5 — Agile and hybrid in depth</h3>
<ul class="check"><li>Backlogs, iterations, flow, retrospectives, adaptive planning.</li><li>About 120 questions.</li></ul>
<h3>Week 6 — Business environment</h3>
<ul class="check"><li>Strategy, benefits, governance, compliance, organisational change.</li><li>First full-length mock under exam conditions; review over two days.</li></ul>
<h3>Week 7 — Targeted repair</h3>
<ul class="check"><li>Rank topics by weakness; 70% of time on the bottom three.</li><li>Second full-length mock.</li></ul>
<h3>Week 8 — Consolidation</h3>
<ul class="check"><li>Mixed timed sets and error-log review; final mock early in the week.</li><li>Logistics: ID, appointment, test environment, pacing checkpoints.</li></ul>

<h2>Review every question with four questions</h2>
<ol><li>What was really asked — first, next, best, most likely?</li><li>What is the context — approach, phase, who is involved?</li><li>Why is the best answer best (which principle)?</li><li>Why is each other option worse?</li></ol>

<h2>Error log</h2>
<table>
<tr><th style="width:11%">Date</th><th style="width:16%">Topic</th><th>Question summary</th><th style="width:20%">Why I missed it</th><th style="width:26%">Principle to apply</th></tr>
<tr><td class="blank"></td><td></td><td></td><td></td><td></td></tr>
<tr><td class="blank"></td><td></td><td></td><td></td><td></td></tr>
<tr><td class="blank"></td><td></td><td></td><td></td><td></td></tr>
<tr><td class="blank"></td><td></td><td></td><td></td><td></td></tr>
<tr><td class="blank"></td><td></td><td></td><td></td><td></td></tr>
<tr><td class="blank"></td><td></td><td></td><td></td><td></td></tr>
</table>

<h2>Mock exam dates</h2>
<table><tr><th>Mock 1 (end of week 6)</th><th>Mock 2 (end of week 7)</th><th>Mock 3 (early week 8)</th><th>Exam date</th></tr><tr><td class="blank"></td><td></td><td></td><td></td></tr></table>
<p class="small">Related: ${a('/blog/pmp-practice-questions', 'PMP practice questions')} · ${a('/blog/pmp-exam-changes-2026', 'PMP exam changes 2026')} · ${a('/blog/pmp-exam-day-checklist', 'PMP exam day checklist')} · ${a('/blog/exam-readiness-checklist', 'Exam readiness checklist')}.</p>`,
    },

    {
      file: 'certification-exam-day-checklist',
      title: 'Certification Exam Day Checklist',
      subject: 'A printable exam day checklist for the PMP and other computer-based certification exams, with a pacing worksheet and a 60-second reset.',
      keywords: ['exam day checklist', 'PMP exam day', 'online proctored exam', 'exam time management', 'exam anxiety', 'certification exam'],
      kicker: 'Exam prep · Free checklist',
      intro: `For the PMP and most computer-based professional exams, online or at a test centre. The official rules in your exam body's handbook and appointment confirmation always take precedence. Full guide: ${a('/blog/pmp-exam-day-checklist', 'PMP exam day checklist')}.`,
      partners: 'certuvo',
      body: `
<div class="cols">
<div>
<h2>One week before</h2>
<ul class="check">
<li>Appointment confirmed: date, time zone, online or test centre.</li>
<li>ID name matches the registration exactly as the rules require.</li>
<li>Candidate rules read: permitted items, breaks, lateness, rescheduling.</li>
<li><b>Online:</b> official system test passed on the same computer, network and room.</li>
<li><b>Online:</b> room private and quiet, desk clear, updates and notifications off.</li>
<li><b>Test centre:</b> route, travel time and arrival time planned.</li>
<li>Final full mock taken early in the week, not the day before.</li>
</ul>
</div>
<div>
<h2>The night before</h2>
<ul class="check">
<li>ID and permitted items laid out.</li>
<li><b>Online:</b> computer restarted, system test run again.</li>
<li><b>Test centre:</b> travel updates checked, two alarms set.</li>
<li>30–45 minutes of light review, then stop.</li>
<li>Normal meal, normal bedtime.</li>
</ul>
<h2>The morning</h2>
<ul class="check">
<li>Familiar meal; water.</li>
<li>Log in or arrive early for check-in.</li>
<li>10 minutes writing down worries, then put the paper away.</li>
<li>Three slow breaths: “This is my body getting ready.”</li>
</ul>
</div>
</div>

<h2>Pacing worksheet</h2>
<p class="small">Use the official total time and number of questions from your appointment details. Rehearse these checkpoints in at least two full mocks.</p>
<table>
<tr><th>Section</th><th>Time</th><th>Questions</th><th>Reserve</th><th>Target per question</th><th>¼ checkpoint</th><th>½ checkpoint</th><th>¾ checkpoint</th></tr>
<tr><td class="blank"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td class="blank"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td class="blank"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
</table>
<div class="box"><b>My flag-and-move rule:</b> if I have no clear answer after about ______ seconds, I eliminate what I can, choose the best remaining option, flag it and move on. I return to flags before the section ends (check whether review is allowed after breaks).</div>

<h2>During the exam</h2>
<ul>
<li>Read the final sentence first: <i>first</i>, <i>next</i>, <i>best</i>, <i>most likely</i>?</li>
<li>Identify the context: approach, phase, who is involved.</li>
<li>Look at the clock only at checkpoints.</li>
<li>A run of hard questions is normal — it does not mean you are failing.</li>
<li>Use permitted breaks: stand, stretch, drink water, one breathing reset.</li>
</ul>

<div class="box amber"><b>60-second reset</b> — when panic rises: eyes off the screen · breathe in for about 4 seconds · breathe out for about 6 seconds · repeat 3–5 times · relax shoulders and jaw · read only the last sentence of the question first.</div>

<h2>If something goes wrong</h2>
<ul>
<li><b>Online technical issue:</b> use the proctor chat or follow the provider's instructions; stay in camera view unless told otherwise.</li>
<li><b>Test centre disruption:</b> raise your hand and tell the administrator.</li>
<li><b>Feeling unwell before the exam:</b> check the official rescheduling rules early.</li>
</ul>
<p class="small">Related: ${a('/blog/exam-time-management-strategies', 'Exam time management')} · ${a('/blog/exam-anxiety-strategies', 'Exam anxiety strategies')} · ${a('/blog/exam-readiness-checklist', 'Exam readiness checklist')}.</p>`,
    },

    {
      file: 'exam-readiness-scorecard',
      title: 'Exam Readiness Scorecard',
      subject: 'A weekly exam readiness scorecard, mock exam log, go or move guidance and a two-week repair plan for professional certification exams.',
      keywords: ['exam readiness', 'mock exam', 'certification exam', 'study plan', 'PMP', 'CPA', 'CMA', 'CIA', 'CISA', 'NCLEX', 'Certuvo'],
      kicker: 'Exam prep · Free scorecard',
      intro: `Decide with evidence, not nerves. Score yourself weekly from the midpoint of your plan. Full guide: ${a('/blog/exam-readiness-checklist', 'Exam readiness checklist')}.`,
      partners: 'certuvo',
      body: `
<h2>Weekly scorecard</h2>
<p class="small">0 = not yet · 1 = partly · 2 = yes. Bands are a rule of thumb to structure your judgement, not a prediction of your result.</p>
<table>
<tr><th style="width:52%">Signal</th><th>Week __</th><th>Week __</th><th>Week __</th><th>Week __</th></tr>
<tr><td>Two or more full mocks completed under exam conditions</td><td></td><td></td><td></td><td></td></tr>
<tr><td>Mock results stable or rising on <i>unseen</i> questions</td><td></td><td></td><td></td><td></td></tr>
<tr><td>No domain consistently well below my average</td><td></td><td></td><td></td><td></td></tr>
<tr><td>Finished mocks on time without rushing at the end</td><td></td><td></td><td></td><td></td></tr>
<tr><td>Error log shrinking; recurring mistakes resolved</td><td></td><td></td><td></td><td></td></tr>
<tr><td>Every blueprint domain studied and practised</td><td></td><td></td><td></td><td></td></tr>
<tr><td>Exam logistics confirmed (ID, date, environment)</td><td></td><td></td><td></td><td></td></tr>
<tr><td>Sleep and routine manageable in the final weeks</td><td></td><td></td><td></td><td></td></tr>
<tr><th>Total (out of 16)</th><td></td><td></td><td></td><td></td></tr>
</table>
<div class="cols">
<div class="box"><b>14–16:</b> ready, if results are in line with your question bank's guidance.<br><b>10–13:</b> nearly there — run the repair plan on the lines scoring 0 or 1.<br><b>Below 10:</b> consider moving the date (check the official rescheduling deadlines).</div>
<div class="box amber"><b>Move the date if:</b> results are well below guidance and not improving · a heavily weighted domain stays weak · a major event will disrupt your final weeks · you keep running out of time.</div>
</div>

<h2>Mock exam log</h2>
<table>
<tr><th>Date</th><th>Mock / source</th><th>Overall</th><th>Weakest domain</th><th>Strongest domain</th><th>Time left at end</th><th>Top 3 error themes</th></tr>
<tr><td class="blank"></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td class="blank"></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td class="blank"></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td class="blank"></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
</table>

<h2>Two-week repair plan</h2>
<table>
<tr><th style="width:16%">When</th><th>Week 1</th><th>Week 2</th></tr>
<tr><td>Days 1–2</td><td>Deep review of the latest mock by domain</td><td>Targeted practice; error log daily</td></tr>
<tr><td>Days 3–5</td><td>Targeted study + 30–40 questions a day in the two weakest domains</td><td>Day 3: targeted practice · Day 4: full mock under exam conditions</td></tr>
<tr><td>Weekend</td><td>Mixed set of 60–100 questions with full review</td><td>Review the mock; score this sheet; decide go or move</td></tr>
</table>

<h2>Extra checks by exam type</h2>
<ul>
<li><b>Scenario-based</b> (e.g. PMP, PCI AI exams): can you explain why each wrong option is wrong?</li>
<li><b>Simulations or essays</b> (e.g. CPA, CMA): can you complete them within your time budget and address every requirement?</li>
<li><b>Adaptive</b> (e.g. NCLEX): is your reasoning consistent on mixed-difficulty sets?</li>
</ul>
<p class="small">Related: ${a('/blog/how-to-review-a-mock-exam', 'How to review a mock exam')} · ${a('/blog/certification-study-plan-template', 'Certification study plan template')} · ${a('/blog/exam-anxiety-strategies', 'Exam anxiety strategies')}.</p>`,
    },
  ];
}

/** The closing block every guide ends with: who published it, the partnership disclosure and where to learn more. */
export function aboutBlock(site, partners) {
  const u = (path) => `${site}${path}`;
  const pciLine = `<a href="https://pciai.org">PCI AI</a> certifies professionals in project controls (PCL-AI), project finance (PFL-AI) and project management (PML-AI), with governed AI throughout — see <a href="${u('/partners/pci-ai')}">our PCI AI page</a>.`;
  const certuvoLine = `<a href="https://certuvo.com">Certuvo</a> offers exam preparation for CIA, CISA, CMA, CPA, CFA, PMP, NCLEX-RN, NCLEX-PN and PCI AI's certifications, with exam-style questions and an AI Coach — see <a href="${u('/partners/certuvo')}">our Certuvo page</a>.`;
  const lines = partners === 'pci' ? [pciLine] : partners === 'certuvo' ? [certuvoLine] : [pciLine, certuvoLine];
  return `<div class="about">
<p><strong>Published by Optimize All.</strong> Free to print and share with attribution. More free guides: <a href="${u('/blog/free-project-controls-and-exam-prep-guides')}">${u('/blog/free-project-controls-and-exam-prep-guides').replace(/^https?:\/\//, '')}</a> · Free courses: <a href="${u('/learn/project-controls-with-ai')}">Project Controls with AI</a>, <a href="${u('/learn/professional-certification-exam-success')}">Professional Certification Exam Success</a>.</p>
<p>${lines.join(' ')}</p>
<p>This is an independent study and work aid, not official material of PMI, AACE International, PCI AI or any other awarding body. Exam rules, fees and formats change: always confirm current details with the official body. <em>Optimize All is the official marketing partner of PCI AI and Certuvo.</em></p>
</div>`;
}
