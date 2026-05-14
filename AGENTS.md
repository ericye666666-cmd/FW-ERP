# FW-ERP Agent / Codex 工作规则

本仓库是 Direct Loop / FW-ERP Retail Ops System 的唯一代码仓库。

任何 Codex / Agent / AI 工具在处理本仓库任务前，必须先阅读以下项目记忆文件：

- docs/project-brain/PROJECT_BRAIN_CN.md
- docs/project-brain/CURRENT_STATUS_CN.md
- docs/project-brain/BUG_LOG_CN.md
- docs/project-brain/PR_REVIEW_LOG_CN.md
- docs/project-brain/STAGING_DEPLOY_LOG_CN.md
- docs/project-brain/TERMS_CN_EN.md

## 工作原则

1. 必须严格按照 GitHub Issue 的 scope 执行。
2. 不允许自行扩大需求。
3. 不允许直接修改 main。
4. 不允许自行合并 PR。
5. 不允许上传 secret、.env、数据库备份、runtime data、zip、node_modules、cache、dist。
6. 不允许修改 production secret 或 production VM 配置。
7. 不允许自动部署 production。
8. 所有代码变更必须走 PR。
9. 每个 PR 必须说明：
   - 对应 Issue
   - 改了哪些文件
   - 是否改前端
   - 是否改后端
   - 是否影响 POS
   - 是否影响条码规则
   - 如何测试
10. 如任务涉及业务规则，必须优先遵守 docs/project-brain/PROJECT_BRAIN_CN.md。

## 业务红线

- POS 只能扫描 STORE_ITEM。
- POS 不允许扫描 RAW_BALE、SDB、LPK、SDO。
- 门店收货只能扫描 SDO。
- SDB 和 LPK 只能作为来源参考，不能作为门店正式收货码。
- 不允许修改 STORE_ITEM barcode generation。
- 不允许修改 barcode resolver 的核心红线。
- 不允许改变库存统计口径，除非 Issue 明确要求。

## 中文项目记录要求

完成 Issue / PR / staging 部署后，应更新对应中文项目文档：

- Bug 处理结果更新到 docs/project-brain/BUG_LOG_CN.md
- PR 审查结果更新到 docs/project-brain/PR_REVIEW_LOG_CN.md
- Staging 部署结果更新到 docs/project-brain/STAGING_DEPLOY_LOG_CN.md
- 当前项目状态更新到 docs/project-brain/CURRENT_STATUS_CN.md

如果不确定是否应该修改某个项目记忆文件，先在 PR 说明里列出建议，不要擅自大范围重写。
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
