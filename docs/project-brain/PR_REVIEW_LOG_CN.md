# PR 审查记录

更新日期：2026-05-14

## 一、PR 审查原则

所有 PR 都必须检查：

- 是否对应明确的 GitHub Issue
- 是否符合本次 Issue 的 scope
- 是否修改了禁止改动范围
- 是否同时处理了必要的前端 / 后端闭环
- 是否有不必要的大范围重构
- 是否上传了不应该提交的文件
- 是否影响 POS 扫码规则
- 是否影响条码 resolver
- 是否影响库存统计口径
- 是否影响 production 配置
- 是否需要 staging 部署验证

## 二、禁止合并的情况

以下情况不建议合并：

- 没有对应 Issue
- scope 明显扩大
- 修改了 POS 扫码红线
- 让 POS 接受 RAW_BALE / SDB / LPK / SDO
- 让门店收货接受 SDB / LPK 作为正式收货码
- 上传 secret、.env、数据库备份、runtime data、zip、node_modules、cache、dist
- 改动 production secret 或 production VM 配置
- 没有处理必要的前端页面
- 没有处理必要的后端 API
- 只改了后端但前端按钮仍然不可用
- 只改了前端但后端数据没有闭环
- 没有说明测试结果

## 三、PR 审查记录格式

PR 编号：  
PR 标题：  
对应 Issue：  
提交人：  
审查日期：  
变更范围：  
是否符合 scope：  
是否修改了禁止范围：  
前端是否修改：  
后端是否修改：  
测试是否通过：  
是否可以合并：  
GPT 审查结论：  
合并状态：  
备注：  

---

## 待记录

当前暂无已记录 PR。

PR 编号：#419  
PR 标题：Rename 默认成本价管理 → 服装默认售价规则 and remove cost ×2 default-sale seeding  
对应 Issue：#419  
提交人：Codex  
审查日期：2026-05-19  
变更范围：仅复跑并核对 PR Testing 命令真实结果（未新增代码改动）。  
是否符合 scope：是  
是否修改了禁止范围：否  
前端是否修改：否  
后端是否修改：否  
测试是否通过：部分通过（见备注）  
是否可以合并：否  
GPT 审查结论：`store-mobile-pricing-preview.test.cjs` 仍失败 4 项，且失败与当前分支页面/路由与文案断言不一致直接相关，不能再标注为 unrelated；其余指定检查均通过。  
合并状态：未合并  
备注：失败点为 login 版本区块断言、未完成上架提示断言、hash-route helper 断言，共 4 个子测试失败（77 passed / 4 failed）。  
