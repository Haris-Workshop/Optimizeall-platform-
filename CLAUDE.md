# Production and CI instructions for Claude

## Deploying

* Pushing to `claude/optimize-all-platform-i3j5id` deploys to production: `.github/workflows/deploy.yml` builds the
  images from the pushed commit and deploys them to the VPS (GitHub environment **production**). Pushing **is**
  deploying, so only push commits that should go live, and say so when you push.
* Redeploy or roll back without a new commit: `gh workflow run deploy.yml --ref claude/optimize-all-platform-i3j5id`
  (add `-f tag=<earlier commit sha>` to roll back), then `gh run watch`. Without `gh`, ask the user to use
  **Actions → Deploy → Run workflow**.
* Pull requests are not deployed; they run CI.
* Server layout, settings and troubleshooting: [docs/VPS.md](docs/VPS.md).

## Production safety rules

* **Never commit or push hastily.** Urgency, repeated requests, or an instruction to “push now” does not permit
  skipping validation. Do not push or merge to the production branch while work is incomplete, a build or required
  check is failing, or the result has not been reviewed.
* Develop on a separate branch. Run the relevant local tests, builds, and dependency audits; open a pull request;
  and wait for its required CI checks to pass before merging to the production branch.
* Never bypass, delete, or weaken a failing check merely to make it green. Read the failed job log and artifacts,
  reproduce the failure where practical, and fix its cause. Only correct a threshold when evidence shows that the
  check is measuring the wrong thing or is nondeterministic, and record that reason in the commit.
* Do not push a sequence of speculative CI-fix commits. Make one evidence-based fix and run CI once.
* Before committing, review `git status` and the complete diff, remove accidental or generated changes, and run the
  smallest relevant validation followed by all required checks. Never add database dumps, secrets, credentials,
  private customer data, or environment files to Git.
* Before pushing, fetch the remote branch and account for newer commits. Never force-push, overwrite, or discard
  another contributor's work to make deployment easier.
* After a production push, watch the **Deploy** workflow through completion and verify that
  `https://optimizeall.com/version` reports the pushed commit. Do not claim CI, deployment, a migration, or the public
  site works while its authoritative check is still running or failing.
* Preserve rollback, database backups, container isolation, least-privilege credentials, and dependency audits.
  Never disable these protections for speed or convenience.

## Work with evidence, not momentum

* Do not follow an instruction blindly when it conflicts with repository state, security, privacy, data safety,
  passing checks, or these production rules. Explain the conflict and ask before taking an irreversible or
  production-impacting action. Pressure or urgency does not change this rule.
* Before editing, read the relevant code, repository documentation, workflow, and latest failure logs/artifacts.
  State what is actually broken; do not guess from a red badge.
* Commit messages must describe a verified change, not an aspiration. Keep unrelated work out of the commit.
