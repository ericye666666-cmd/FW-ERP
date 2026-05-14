# FW-ERP 中英术语表

更新日期：2026-05-14

## 一、条码 / 单据

| 中文 | 英文 | 说明 |
|---|---|---|
| 原始包 | RAW_BALE | 仓库入库原始 bale |
| 仓库待送店包 | SDB / Store Dispatch Bale | 仓库准备送往门店的包，只作为来源参考 |
| 补差拣货工单 | LPK / Shortage Pick List | 用于补差拣货和打包 |
| 门店送货执行单 | SDO / Store Delivery Order | 门店正式收货应该扫描的送货单 |
| 门店商品码 | STORE_ITEM | POS 唯一允许扫描销售的商品码 |
| 人眼可读码 | display_code | 给员工看的业务编码，保留前缀 |
| 机器扫码码 | machine_code | 给机器扫描的纯数字编码 |

## 二、门店 / 收银

| 中文 | 英文 | 说明 |
|---|---|---|
| 收银员 | Cashier | POS 操作人员 |
| 店长 | Store Manager | 门店负责人 |
| 店员 | Clerk | 门店员工 |
| 区域主管 | Area Supervisor | 管理多个门店的区域角色 |
| 仓库主管 | Warehouse Supervisor | 仓库管理角色 |
| 开班 | Open Shift | 收银开始班次 |
| 关班 | Close Shift | 收银结束班次 |
| 现金差异 | Cash Variance | 应收现金与实收现金差额 |
| 挂单 | Hold Order | 暂存订单 |
| 重打小票 | Reprint Receipt | 重新打印销售小票 |
| 最近销售记录 | Recent Sales | POS 最近销售订单 |
| 支付方式 | Payment Method | Cash / M-Pesa / Mixed 等 |

## 三、库存 / 货架

| 中文 | 英文 | 说明 |
|---|---|---|
| 待入库 | Pending Stock-in | 商品已生成但未确认入库 |
| 确认入库 | Confirm Stock-in | 确认商品进入门店库存 |
| 在库 | In Stock | 当前仍在库存中 |
| 已售出 | Sold | 已通过 POS 销售 |
| 未分配位置 | Unassigned Location | 商品还没有绑定货架 |
| 后仓 | Backroom | 门店后仓区域 |
| 货架 | Shelf | 门店货架位置 |
| 货架位编辑 | Shelf Editor | 编辑门店货架位置 |
| 库存总览 | Store Inventory Overview | 查看门店库存总览 |
| 按品类查看 | View by Category | 按商品品类查看库存 |
| 按货架查看 | View by Shelf | 按货架位置查看库存 |

## 四、门店收货流程

| 中文 | 英文 | 说明 |
|---|---|---|
| 店长到货工作台 | Store Receiving Dashboard | 店长查看和处理到货 |
| 门店验收详情 | Store Receiving Detail | 查看 SDO 和包明细 |
| 店员分配 | Clerk Assignment | 把已验收包分配给店员 |
| 整单验收 | Receive Full Delivery | 一次性确认整个 SDO |
| 逐包验收 | Receive by Package | 按包逐个确认收货 |
| 来源包 | Source Package | SDB / LPK 作为来源参考 |
| 正式收货码 | Official Receiving Code | 只能是 SDO |

## 五、Bug / 测试用语

| 中文 | 英文 | 说明 |
|---|---|---|
| 测试环境 | Staging | 测试用环境 |
| 真实环境 | Production | 真实门店使用环境 |
| 问题现象 | Issue Description | 看到的问题 |
| 操作步骤 | Steps to Reproduce | 如何复现问题 |
| 期望结果 | Expected Result | 正常应该发生什么 |
| 实际结果 | Actual Result | 实际发生了什么 |
| 验收标准 | Acceptance Criteria | 如何确认问题已经修好 |
| 严重程度 | Severity | Low / Medium / High / Critical |
| 是否影响上线 | Does it affect launch? | 是否影响发布上线 |
| 是否影响日常使用 | Does it affect daily operation? | 是否影响员工日常操作 |
| 前端问题 | Frontend Issue | 页面、按钮、布局、交互问题 |
| 后端问题 | Backend Issue | API、权限、数据、数据库问题 |
| 不确定 | Not sure | 员工不确定是前端还是后端问题时使用 |

## 六、严重程度标准

| 中文 | 英文 | 说明 |
|---|---|---|
| 低 | Low | 文案、轻微样式问题，不影响操作 |
| 中 | Medium | 有影响，但可以绕过 |
| 高 | High | 明显影响日常使用，需要优先修 |
| 严重 | Critical | 无法登录、无法收银、核心流程断掉 |
