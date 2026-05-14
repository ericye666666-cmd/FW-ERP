# 当前项目状态

更新日期：2026-05-14

## 一、当前环境

### Production 真实环境

- 地址：https://directlooperp.com/app/
- API：https://directlooperp.com/api/v1
- VM：fw-erp-production
- IP：34.35.179.34

### Staging 测试环境

- 地址：https://staging.directlooperp.com/app/
- API：https://staging.directlooperp.com/api/v1
- VM：fw-erp-prod
- IP：34.35.52.250

## 二、当前工作重点

当前主要在 staging 测试环境排查真实门店使用前的问题。

重点包括：

- 不同角色登录是否正常
- 页面权限是否正确
- POS 是否适合 1366 × 768 收银一体机
- 店铺 / 账号 / 角色信息是否同步
- 页面按钮是否可用
- 前端和后端是否都完成闭环
- PR 合并后 staging VM 是否真正更新
- 测试环境和真实环境是否隔离清楚

## 三、当前协作流程

1. 用户发现 bug / 提出需求。
2. GPT 整理 GitHub Issue 文本。
3. GPT 输出给 Codex 的执行指令。
4. 用户把指令粘贴给本地 Codex。
5. Codex 修改代码并发布 PR。
6. GPT 审查 PR。
7. 用户确认后合并 PR。
8. 合并后部署 staging VM。
9. 用户在 staging 页面测试是否解决。
10. 结果记录回本文件和 BUG_LOG_CN.md。

## 四、未来目标流程

未来接入 Agent 后，目标流程是：

1. 用户只向 GPT 描述 bug / 需求。
2. GPT 输出 Issue、Codex 指令、验收标准、禁止改动范围。
3. Agent 创建 / 更新 GitHub Issue。
4. Agent 记录中文项目文档。
5. Agent 把指令交给 Codex。
6. Codex 出 PR。
7. GPT 审查 PR。
8. GPT 明确批准后，Agent 合并 PR 到 main。
9. Agent 部署 staging VM。
10. Agent 更新中文项目记录。
11. 用户只在 staging 页面做最终验收。

## 五、最近发现的问题

### BUG-001：区域主管 Swahili 账号无法登录

- 环境：Staging
- 账号 / 角色：Swahili / 区域主管
- 严重程度：Critical
- 状态：待处理

### BUG-002：仓库主管 Dan 不应看到“今日总览”

- 环境：Staging
- 账号 / 角色：Dan / 仓库主管
- 严重程度：High
- 状态：待处理

### BUG-003：全系统删除“今日总览”

- 环境：Staging / 全系统
- 说明：需要删除“今日总览”及其下所有功能和菜单。
- 严重程度：High
- 状态：待处理

### BUG-004：POS 顶部店铺信息与登录账号不同步

- 环境：Staging
- 账号 / 角色：Cashier
- 示例：Lucky Summer cashier 登录后，顶部仍显示 Utawala。
- 严重程度：High
- 状态：待处理

### BUG-005：POS 页面不适配 1366 × 768 收银一体机

- 环境：Staging
- 账号 / 角色：Cashier
- 说明：页面需要下拉很多才能显示完整，不适合收银员操作。
- 严重程度：High
- 状态：待处理

## 六、当前上线判断

当前不建议直接进入 production 全量使用。

需要优先完成：

- 登录权限修复
- POS 页面适配
- 角色菜单权限清理
- staging 部署流程稳定
- PR 审查和部署记录标准化

## 七、下一步建议

1. 继续整理 staging bug。
2. 每个 bug 拆成单独 GitHub Issue。
3. 每个 Issue 都写清楚：
   - 账号 / 角色
   - 页面路径
   - 操作步骤
   - 期望结果
   - 实际结果
   - 验收标准
   - 禁止改动范围
4. Codex 恢复额度后，按 P0 / P1 顺序处理。
5. 每个 PR 合并后记录到 PR_REVIEW_LOG_CN.md。
6. 每次 staging 部署后记录到 STAGING_DEPLOY_LOG_CN.md。
