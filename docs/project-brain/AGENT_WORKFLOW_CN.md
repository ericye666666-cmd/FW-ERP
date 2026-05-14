# FW-ERP Agent 工作流程说明

更新日期：2026-05-14

## Agent 定位

Agent 是流程执行助手，不是业务决策者。Agent 只执行 GPT 已经确认的 Issue、Codex 指令、PR 审查结论和 staging 部署步骤。

## 用户输入格式

用户向 GPT 描述 bug 时使用：

标题：
现象：
账号/角色：
页面路径：
操作步骤：
期望结果：
实际结果：
截图：
严重程度：
是否影响上线：

GPT 输出 Issue 标题、正文、labels、Codex text、验收标准和禁止改动范围。

## 标准流程

1. Agent 根据 GPT 输出创建 GitHub Issue，并添加 labels。
2. Agent 将 GPT 生成的 Codex text 发给本地 Codex。
3. Codex 创建 branch、修改代码并提交 PR。
4. Agent 发现 PR 后，把 PR 编号、链接、changed files、测试结果和风险点发给 GPT 审查。
5. GPT 给出 A / B / C 三类审查结论。
6. A 类或 B 类时，Agent 可以合并 PR 到 main。
7. 合并后，Agent 部署 staging VM。
8. Agent 运行 staging 页面自动巡检。
9. Agent 将截图、日志、console error、network error 和初步验收结果反馈给 GPT 和用户。
10. 用户在 staging 页面做最终验收。

## GPT PR 审查分类

### A 类：可以直接合并

PR 没有违反业务红线，没有明显扩大 scope，没有明显破坏核心流程，可以合并到 main 并部署 staging。

### B 类：可以合并，但记录 follow-up

PR 已解决本次 Issue 主要目标，但存在小问题，例如文案、样式、非阻塞体验问题。Agent 可以合并、部署 staging，并把小问题记录为 follow-up。

### C 类：禁止合并

PR 存在阻塞问题，不能合并。包括但不限于：违反 POS / 条码 / 门店收货红线、扩大 scope、改动 production 配置、提交 forbidden files、前后端明显未闭环、build 或 test 明确失败、PR 未关联 Issue。

## 合并触发条件

Agent 只有在 GPT 明确写出以下句式时，才可以合并：

- A 类：可以直接合并 PR #xxx 到 main
- B 类：可以合并 PR #xxx 到 main，并记录 follow-up

模糊表达不算批准，例如：看起来可以、应该没问题、大概可以、没什么大问题、你自己判断、可以考虑合并。

## Staging 部署

Staging 环境：

- URL：https://staging.directlooperp.com/app/
- API：https://staging.directlooperp.com/api/v1
- VM：fw-erp-prod
- IP：34.35.52.250

Agent 合并 PR 后可以通过 SSH 部署 staging：拉取最新 main、安装必要依赖、build 前端、执行必要后端更新、重启服务、输出 commit hash、检查页面和 API。

Agent 不允许自动部署 production。

## Staging 页面自动巡检

部署 staging 后，Agent 可以运行自动巡检：

1. 确认 VM 当前 commit 与 main 一致。
2. 确认前端页面可以打开。
3. 确认 API 正常响应。
4. 使用 staging 测试账号登录相关角色。
5. 打开本次 Issue 涉及页面。
6. 检查 console error。
7. 检查关键 API 4xx / 5xx。
8. 截图。
9. 按 Issue 验收标准给出初步通过 / 失败判断。
10. 反馈给 GPT 和用户。

自动巡检不是最终验收。最终验收仍由用户在 staging 页面确认。

## 项目记录

Agent 完成 Issue、PR、部署、巡检后，应更新：

- docs/project-brain/BUG_LOG_CN.md
- docs/project-brain/PR_REVIEW_LOG_CN.md
- docs/project-brain/STAGING_DEPLOY_LOG_CN.md
- docs/project-brain/CURRENT_STATUS_CN.md

只追加或更新相关条目，不大范围重写，不删除历史记录。

## 禁止事项

Agent 不允许：

1. 自己决定业务规则。
2. 自己扩大 Issue scope。
3. 自己直接 push main。
4. 合并没有 GPT 批准的 PR。
5. 自动部署 production。
6. 修改 production secret。
7. 提交 secret、.env、数据库备份、runtime data、zip、node_modules、cache、dist。
8. 修改 POS 扫码规则。
9. 让 POS 接受 RAW_BALE / SDB / LPK / SDO。
10. 让门店收货接受 SDB / LPK 作为正式收货码。
11. 修改 STORE_ITEM barcode generation。
12. 修改 barcode resolver 核心红线。
13. 修改库存统计口径，除非 Issue 明确要求。

## Production 原则

PR 合并到 main 并部署 staging，不代表可以发布 production。production 发布必须由用户单独确认。
