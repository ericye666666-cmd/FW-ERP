## 五、GPT PR 审查与快速合并标准

为了提高 staging 测试效率，FW-ERP 的 PR 审查采用“快速进入 staging、production 严格控制”的原则。

main 当前作为 staging 可部署主线使用。PR 合并到 main 后，只允许部署 staging，不允许自动部署 production。

GPT 审查 PR 时，需要给出以下三类结论之一：

### A 类：可以直接合并

含义：
PR 没有违反业务红线，没有明显扩大 scope，没有明显破坏核心流程，可以直接合并到 main 并部署 staging。

Agent 可以执行：
1. 合并 PR 到 main。
2. 部署 staging VM。
3. 更新项目记录。
4. 提醒用户测试 staging。

### B 类：可以合并，但需要记录 follow-up

含义：
PR 解决了本次 Issue 的主要目标，但仍存在小问题，例如：
- 文案不够好
- 样式细节可优化
- 代码结构一般但可运行
- 有轻微体验问题
- 有非阻塞性遗漏

这些问题不阻止进入 staging 测试。

Agent 可以执行：
1. 合并 PR 到 main。
2. 部署 staging VM。
3. 把 GPT 提到的小问题记录为 follow-up issue，或评论到原 Issue。
4. 更新项目记录。
5. 提醒用户测试 staging。

### C 类：禁止合并，必须打回 Codex

含义：
PR 存在阻塞问题，不能合并。

包括但不限于：
1. 修改 POS 扫码红线。
2. 让 POS 接受 RAW_BALE / SDB / LPK / SDO。
3. 让门店收货接受 SDB / LPK 作为正式收货码。
4. 修改 STORE_ITEM barcode generation。
5. 修改 barcode resolver 核心红线。
6. 修改库存统计口径但 Issue 没有要求。
7. 修改 production 配置。
8. 上传 secret、.env、数据库备份、runtime data、zip、node_modules、cache、dist。
9. 大范围重构或明显扩大 scope。
10. 只改前端但后端问题未闭环。
11. 只改后端但前端页面 / 按钮仍不可用。
12. build / test 明确失败。
13. PR 没有关联 Issue。
14. PR 描述不清楚，无法判断改了什么。

Agent 必须执行：
1. 不合并 PR。
2. 把 GPT 的修改意见转发给 Codex。
3. 等待 Codex 更新 PR。
4. 再次提醒 GPT 审查。

## 六、Agent 合并触发条件

Agent 只有在 GPT 明确写出以下结论之一时，才可以合并：

- A 类：可以直接合并 PR #xxx 到 main
- B 类：可以合并 PR #xxx 到 main，并记录 follow-up

以下表达不算批准：

- 看起来可以
- 应该没问题
- 大概可以
- 没什么大问题
- 你自己判断
- 可以考虑合并

## 七、Production 发布原则

即使 PR 已经合并到 main 并部署 staging，也不代表可以发布 production。

production 发布必须由用户单独确认。
Agent 不允许自动部署 production。
