# FW-ERP / Direct Loop Retail Ops System 项目大脑

更新日期：2026-05-14

## 一、项目背景

FW-ERP 是 Direct Loop 在肯尼亚二手服装和百货零售门店使用的 ERP / POS 系统。

系统支持：

- 仓库入库
- 仓库分拣
- 门店补货
- 仓库出库
- 门店收货
- 店长分配给店员
- 店员 PDA 上架
- 生成 STORE_ITEM 商品码
- POS 收银销售
- 库存查询
- 经营分析

## 二、核心业务主流程

中国 / 仓库入库 RAW_BALE  
→ 仓库分拣  
→ 形成 SDB 待送店包 / 散件库存  
→ 门店补货申请  
→ 仓库生成 LPK 补差拣货工单  
→ 仓库生成 SDO 门店送货执行单  
→ 门店扫描 SDO 收货  
→ 店长分配给店员  
→ 店员 PDA 上架并生成 STORE_ITEM  
→ POS 只能扫描 STORE_ITEM 销售  

## 三、条码规则红线

- RAW_BALE：仓库原始包码，POS 不可扫，门店不可作为收货码。
- SDB：仓库待送店包，只作为来源参考，门店不可作为正式收货码，POS 不可扫。
- LPK：补差拣货 / 打包工单，只作为来源参考，门店不可作为正式收货码，POS 不可扫。
- SDO：正式门店送货执行单，是门店收货唯一应该扫描的送货码，POS 不可扫。
- STORE_ITEM：门店商品码，POS 只能扫描 STORE_ITEM。

## 四、机器码规则

实体标签分为：

- display_code：给人看，保留业务前缀。
- machine_code：给机器扫，使用纯数字。

类型位规则：

- 1 = RAW_BALE
- 2 = SDB
- 3 = LPK
- 4 = SDO
- 5 = STORE_ITEM

示例：

- LPK260428001 → 3260428001
- SDO260429001 → 4260429001

## 五、POS 扫码红线

POS 只能扫描 STORE_ITEM。

POS 不允许扫描：

- RAW_BALE
- SDB
- LPK
- SDO

如果 POS 扫到非 STORE_ITEM 条码，应该明确拒绝，并提示该条码不能用于收银销售。

## 六、门店收货红线

门店收货只能扫描 SDO。

SDB 和 LPK 只能作为来源包信息展示，不能成为门店正式收货码。

门店收货流程：

Page 5 店长到货工作台  
→ 扫描 / 选择 SDO  
→ Page 6 门店验收详情  
→ 展开 SDO 内包明细  
→ 逐包或整单验收  
→ Page 6.1 分配给店员  

## 七、协作原则

- GitHub 是唯一代码仓库。
- 所有 bug / feature 先建 GitHub Issue。
- Codex 只按 Issue / 指令执行代码。
- Codex 不允许直接改 main。
- Codex 不允许合并 PR。
- GPT 负责架构判断、Issue 整理、Codex 指令、PR 审查。
- Agent 未来只作为流程执行和项目记录助手。
- 所有变更必须走小 PR。
- 不允许上传 secret、数据库备份、runtime data、zip、node_modules、cache、dist 等文件。
- 不允许大范围重构。
- 不允许顺手修改无关业务逻辑。
- 不允许把 staging 和 production 混在一起操作。

## 八、当前阶段目标

当前阶段重点是测试环境 staging 的稳定性：

- 登录权限正确
- POS 页面稳定
- 门店收货流程稳定
- 库存总览稳定
- 货架位编辑稳定
- 前后端数据一致
- staging VM 部署流程稳定

## 九、Agent 未来职责

Agent 可以做：

- 创建 / 更新 GitHub Issue
- 更新 docs/project-brain/ 下的中文项目文档
- 跟踪 Codex PR
- 记录 PR 审查结论
- 在 GPT 明确批准后合并 PR
- 部署 staging VM
- 记录 staging 部署结果
- 更新 CURRENT_STATUS_CN.md

Agent 不可以做：

- 自己决定业务规则
- 自己扩大需求
- 自己部署 production
- 自己修改 production secret
- 自己删除数据库
- 自己绕过 GPT 审查
- 直接 push main
- 合并没有 GPT 明确批准的 PR
