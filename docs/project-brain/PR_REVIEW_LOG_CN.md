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
