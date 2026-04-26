# AGENTS.md

## Role split

ChatGPT is responsible for product thinking, process review, task planning, PR review, and acceptance criteria.
Codex is responsible only for implementation.

## Hard rules for Codex

- Do not invent new business requirements.
- Do not expand scope beyond the GitHub Issue or PR comment.
- Do not merge pull requests.
- Do not push directly to main.
- Always create a branch and open a pull request.
- Do not add secrets, .env files, datasets, backups, zip files, node_modules, dist, output, or large files.
- Do not add backend/database integration unless explicitly requested.
- Keep each task small and reviewable.
- Every PR must explain what changed visually and how a non-developer can verify it by clicking.

## Project context

This repository is the main FW-ERP / retail operations admin frontend for Direct Loop / Beyond ERP.

The key operational flow is:

1. Bale / carton inbound
2. Supplier and batch registration
3. Sorting task creation
4. Sorting result entry by category, grade, and quantity
5. Pricing / label preparation
6. Warehouse location assignment
7. Store allocation and transfer
8. Store receiving and shelf display
9. Sales data feedback
10. Slow-moving stock return
11. Re-sorting returned stock
12. B2B bale packing and wholesale sale

## UI principles

- The user is a non-developer and validates through clickable pages.
- Prioritize operational clarity over decoration.
- Each screen should map to a real business action.
- Use realistic Direct Loop / Beyond ERP wording.
- Do not build real backend integration until the workflow is confirmed.
- Do not make large architecture changes unless ChatGPT explicitly plans them.

## Before coding

Codex must:
1. Restate the task in no more than 5 bullets.
2. List expected files to modify.
3. Keep implementation minimal.

## After coding

Codex must report:
1. Changed files.
2. Checks run.
3. Remaining risks.
4. Pull request link.
5. What changed on the clickable page.
6. How a non-developer can verify the change.
