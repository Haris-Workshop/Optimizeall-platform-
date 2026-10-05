# Notes for Claude

## Deploying

* Pushing to `claude/optimize-all-platform-i3j5id` deploys to production: `.github/workflows/deploy.yml` builds the
  images from the pushed commit and deploys them to the VPS (GitHub environment **production**). Pushing **is**
  deploying, so only push commits that should go live, and say so when you push.
* Redeploy or roll back without a new commit: `gh workflow run deploy.yml --ref claude/optimize-all-platform-i3j5id`
  (add `-f tag=<earlier commit sha>` to roll back), then `gh run watch`. Without `gh`, ask the user to use
  **Actions → Deploy → Run workflow**.
* Pull requests are not deployed; they run CI.
* Server layout, settings and troubleshooting: [docs/VPS.md](docs/VPS.md).
