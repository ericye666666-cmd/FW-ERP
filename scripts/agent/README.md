# Local Agent Scripts

This folder contains the minimal local Agent pipeline for FW-ERP PR review and staging deployment.

## Scripts

- `gpt-review-pr.mjs`: reviews one PR with OpenAI, prints an A/B/C conclusion, and comments the result back to the PR.
- `pr-watch.mjs`: finds the latest open PR linked to an Issue, runs GPT review, and optionally merges A/B class PRs plus deploys staging when `--auto` is passed.
- `staging-deploy.sh`: updates the staging VM checkout to GitHub `main`, restarts `fw-erp.service`, and runs local health checks.

## Requirements

- `gh` CLI is installed, logged in, and has access to `ericye666666-cmd/FW-ERP`.
- `OPENAI_API_KEY` is set before running GPT review scripts.
- `OPENAI_REVIEW_MODEL` is optional. Default: `gpt-4.1-mini`.
- SSH alias `fw-erp-staging` is configured on the local machine.

## Common Commands

Review one PR:

```bash
node scripts/agent/gpt-review-pr.mjs 311
```

Find a PR by Issue and review it only:

```bash
node scripts/agent/pr-watch.mjs 312
```

Find a PR by Issue, review it, and for A/B class results merge plus deploy staging:

```bash
node scripts/agent/pr-watch.mjs 312 --auto
```

Deploy staging only:

```bash
bash scripts/agent/staging-deploy.sh
```

## Safety Notes

- These scripts never deploy production.
- `pr-watch.mjs` does not merge or deploy by default.
- Merge and staging deployment only happen when `--auto` is passed and GPT review returns A or B.
- `gpt-review-pr.mjs` never merges and never deploys staging.
- `staging-deploy.sh` only accesses the `fw-erp-staging` SSH alias, checks that the remote branch is `main`, stops when the staging working tree is dirty, and does not run `npm install`, `npm build`, database migrations, or production secret changes.
