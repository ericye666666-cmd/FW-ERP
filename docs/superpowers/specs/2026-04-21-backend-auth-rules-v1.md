# 后端接口鉴权规则 V1

日期：2026-04-21

关联设计稿：

- [角色权限矩阵 V1 设计](/Users/ericye/Desktop/AI自动化/retail_ops_system/docs/superpowers/specs/2026-04-21-role-permission-matrix-v1-design.md)

适用范围：当前一期仅覆盖以下 5 个角色

- `warehouse_supervisor` = 仓库主管
- `area_supervisor` = 区域运营经理
- `store_manager` = 店长
- `store_clerk` = 店员
- `cashier` = 收银员

重要说明：

- 当前后端种子角色里还没有 `store_clerk`，V1 必须补上。
- 当前很多接口只做了 `_require_current_user()`，还没有做角色、设备、数据范围硬校验。
- 本文档的目标是把“前端隐藏”升级成“后端拒绝越权”。

## 1. 总体鉴权原则

后端所有业务接口统一执行以下顺序：

1. 校验登录态
2. 解析当前激活角色
3. 校验设备类型
4. 校验接口动作权限
5. 校验数据范围
6. 若为 POS 操作，再校验班次、POS 设备、开班会话

默认原则：

- 未显式允许 = 一律拒绝
- 只允许当前 5 个角色访问与自己工作区相关的接口
- 一律禁止“因为前端没显示，所以后端默认放过”

## 2. 请求上下文约定

V1 建议后端统一从请求上下文中拿以下信息：

- `current_user.username`
- `current_user.role_codes`
- `active_role_code`
- `device_type`
- `store_code`
- `warehouse_code`
- `region_store_codes`
- `pos_device_id`
- `active_shift_no`

建议字段来源：

- `Authorization`: 登录态
- `X-Active-Role`: 当前激活角色
- `X-Device-Type`: `desktop` / `pda` / `pos`
- `X-Pos-Device-Id`: POS 设备号，仅 POS 请求必填

若账户只有一个角色，`X-Active-Role` 可省略，后端自动取唯一角色。

若账户有多个角色：

- 不传 `X-Active-Role` = `400`
- 传了但不属于该用户 = `403`

## 3. 错误返回规则

- 未登录或 token 无效：`401`
- 角色不允许：`403`
- 设备不允许：`403`
- 数据范围不允许：`403`
- POS 非当班、非绑定设备、未开班：`403`
- 资源存在但不在数据范围内：优先返回 `403`，不要伪装成成功

## 4. 角色与设备硬约束

| 角色 | 允许设备 | 后端硬限制 |
| --- | --- | --- |
| `warehouse_supervisor` | `desktop` | 拒绝 `pda` / `pos` 进入仓库动作接口 |
| `area_supervisor` | `desktop` | 拒绝 `pda` / `pos` 进入区域管理接口 |
| `store_manager` | `desktop` | 拒绝 `pos` 直接做销售提交 |
| `store_clerk` | `desktop` / `pda` | 拒绝 `pos` 销售、退款、作废、审批接口 |
| `cashier` | `pos` | 拒绝普通 `desktop` / `pda` 会话直接调用 POS 销售类接口 |

补充规则：

- `store_manager` 若兼任 `store_clerk`，必须切到 `store_clerk` 角色后，才能做店员动作。
- `store_manager` 若兼任 `cashier`，必须切到 `cashier` 角色且满足 POS 班次规则后，才能做收银动作。

## 5. 数据范围硬约束

### 5.1 仓库主管

- 仅可访问自己所属仓库数据
- 不可访问门店明细销售、POS 班次、店员作业详情
- 可看与仓库发店相关的调拨、dispatch、退仓记录

### 5.2 区域运营经理

- 仅可访问自己所辖区域门店数据
- 可看区域调拨单、门店签收状态、门店现金交接、现金异常、新店筹划事项
- 不可访问非本区域门店
- 不可直接执行仓库入仓、仓库分拣、店员上架、POS 销售

### 5.3 店长

- 仅可访问本店数据
- 可看本店 dispatch bale、分配、签收、进度、库存、销售、退款/作废审批、支付异常、现金交接
- 不可看其他门店数据

### 5.4 店员

- 仅可访问本店，且只限自己被分配的 bale / token / 上架会话
- 不可读取其他店员待上架商品
- 不可访问整店审批数据

### 5.5 收银员

- 仅可访问本店，且只限当前 POS 设备、当前班次、当前会话
- 不可查看其他收银员班次
- 不可跨 POS 设备销售

## 6. POS 额外强校验

以下接口除角色校验外，必须同时校验：

- `POST /api/v1/sales`
- `POST /api/v1/sales/{order_no}/void-request`
- `POST /api/v1/sales/{order_no}/refund-request`
- `POST /api/v1/pos/shifts/open`
- `POST /api/v1/pos/shifts/{shift_no}/close`
- `POST /api/v1/pos/shifts/{shift_no}/handover-request`

强校验内容：

1. `active_role_code == cashier`
2. `device_type == pos`
3. `pos_device_id` 必填
4. 该用户是该 `store_code + pos_device_id + shift_date + shift_slot` 的排班收银员
5. 销售、退款、作废、交班操作必须关联当前开班中的 `shift_no`

硬规则：

- 有 `cashier` 角色但今天不当班 = 禁止收银
- 当班但不是这台 POS 设备 = 禁止收银
- 开班前 = 禁止销售、退款、作废
- 关班后 = 禁止继续销售

## 7. 接口分组鉴权矩阵

## 7.1 登录与会话接口

| 接口 | 允许角色 | 设备 | 规则 |
| --- | --- | --- | --- |
| `POST /api/v1/auth/login` | 全部 5 角色 | 全部 | 登录不做业务角色拦截 |
| `GET /api/v1/auth/me` | 全部 5 角色 | 全部 | 返回可用角色、默认设备、数据范围 |
| `POST /api/v1/auth/logout` | 全部 5 角色 | 全部 | 注销当前会话 |

## 7.2 总览与看板接口

| 接口 | `warehouse_supervisor` | `area_supervisor` | `store_manager` | `store_clerk` | `cashier` | 规则 |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/dashboard/summary` | 可 | 可 | 可 | 否 | 否 | 店长仅本店摘要；区域经理仅区域摘要；仓库主管仅仓库关联摘要 |
| `GET /api/v1/dashboard/store-operating-summary` | 否 | 可 | 可 | 否 | 否 | 店长仅本店；区域经理仅区域内门店 |
| `GET /api/v1/dashboard/store-closing-checklist/{store_code}` | 否 | 可 | 可 | 否 | 否 | 店长仅本店；区域经理仅区域内门店 |

## 7.3 仓库执行接口

| 接口 | `warehouse_supervisor` | `area_supervisor` | `store_manager` | `store_clerk` | `cashier` | 规则 |
| --- | --- | --- | --- | --- | --- | --- |
| `POST /api/v1/warehouse/inbound-shipments` | 可 | 否 | 否 | 否 | 否 | 仓库主管执行 |
| `GET /api/v1/warehouse/inbound-shipments` | 可 | 否 | 否 | 否 | 否 | 仅所属仓库 |
| `POST /api/v1/warehouse/parcel-batches` | 可 | 否 | 否 | 否 | 否 | 仅所属仓库 |
| `GET /api/v1/warehouse/parcel-batches` | 可 | 否 | 否 | 否 | 否 | 仅所属仓库 |
| `POST /api/v1/warehouse/sorting-tasks` | 可 | 否 | 否 | 否 | 否 | 仅所属仓库 |
| `GET /api/v1/warehouse/sorting-tasks` | 可 | 否 | 否 | 否 | 否 | 仅所属仓库 |
| `POST /api/v1/warehouse/sorting-tasks/{task_no}/results` | 可 | 否 | 否 | 否 | 否 | 仅所属仓库 |
| `GET /api/v1/warehouse/sorting-stock` | 可 | 否 | 否 | 否 | 否 | 仅所属仓库 |
| `PATCH /api/v1/warehouse/sorting-stock/rack` | 可 | 否 | 否 | 否 | 否 | 仅所属仓库 |
| `GET /api/v1/warehouse/item-barcode-tokens` | 可 | 否 | 否 | 否 | 否 | 仓库 token 列表 |
| `GET /api/v1/warehouse/item-identity-ledger/{identity_no}` | 可 | 可 | 可 | 否 | 否 | 店长仅本店相关 identity；区域经理仅区域内；仓库主管仅仓库相关 |

## 7.4 门店 dispatch 与店员执行接口

| 接口 | `warehouse_supervisor` | `area_supervisor` | `store_manager` | `store_clerk` | `cashier` | 规则 |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/stores/dispatch-bales` | 否 | 可 | 可 | 可 | 否 | 区域经理看区域；店长看本店；店员仅自己被分配或待接手 bale |
| `POST /api/v1/stores/dispatch-bales/{bale_no}/accept` | 否 | 否 | 可 | 否 | 否 | 仅本店店长签收 |
| `POST /api/v1/stores/dispatch-bales/{bale_no}/assign` | 否 | 否 | 可 | 否 | 否 | 仅本店店长分配 |
| `GET /api/v1/stores/dispatch-bales/{bale_no}/tokens` | 否 | 可 | 可 | 可 | 否 | 店员仅当自己被分配到该 bale 时可看 |
| `PATCH /api/v1/stores/item-barcode-tokens/{token_no}/edit` | 否 | 否 | 否 | 可 | 否 | 店员仅可编辑自己被分配 token；店长不直接调用此接口 |
| `GET /api/v1/store-token-receiving-sessions` | 否 | 否 | 可 | 可 | 否 | 店长看本店全部；店员仅自己会话 |
| `POST /api/v1/store-token-receiving-sessions/start` | 否 | 否 | 否 | 可 | 否 | 仅店员开启自己的上架会话 |
| `GET /api/v1/store-token-receiving-sessions/{session_no}` | 否 | 否 | 可 | 可 | 否 | 店长看本店；店员仅自己 |
| `GET /api/v1/store-token-receiving-sessions/{session_no}/placement-suggestions/{token_no}` | 否 | 否 | 否 | 可 | 否 | 仅店员自己会话 |
| `POST /api/v1/store-token-receiving-sessions/{session_no}/batches` | 否 | 否 | 否 | 可 | 否 | 仅店员提交自己上架批次 |
| `POST /api/v1/store-token-receiving-sessions/{session_no}/finalize` | 否 | 否 | 否 | 可 | 否 | 仅店员完成自己会话 |

## 7.5 调拨、签收、差异接口

| 接口 | `warehouse_supervisor` | `area_supervisor` | `store_manager` | `store_clerk` | `cashier` | 规则 |
| --- | --- | --- | --- | --- | --- | --- |
| `POST /api/v1/transfers` | 否 | 可 | 否 | 否 | 否 | 区域经理创建区域调拨单；仅限本区域门店 |
| `GET /api/v1/transfers` | 可 | 可 | 可 | 否 | 否 | 仓库主管看与自己仓库相关；区域经理看区域；店长看本店收发相关 |
| `GET /api/v1/transfers/{transfer_no}` | 可 | 可 | 可 | 否 | 否 | 同上 |
| `POST /api/v1/transfers/{transfer_no}/approve` | 可 | 否 | 否 | 否 | 否 | 仅仓库主管做仓库放行/出库审批 |
| `POST /api/v1/transfers/{transfer_no}/receive` | 否 | 否 | 可 | 否 | 否 | 仅本店店长确认收货 |
| `POST /api/v1/transfers/{transfer_no}/discrepancy-approval` | 否 | 可 | 否 | 否 | 否 | 仅区域经理审批收货差异 |
| `GET /api/v1/receiving-sessions` | 否 | 可 | 可 | 否 | 否 | 区域经理看区域；店长看本店 |
| `GET /api/v1/transfers/{transfer_no}/receiving-sessions` | 否 | 可 | 可 | 否 | 否 | 同上 |
| `POST /api/v1/transfers/{transfer_no}/receiving-sessions/start` | 否 | 否 | 可 | 否 | 否 | 店长发起本店收货会话 |
| `GET /api/v1/receiving-sessions/{session_no}` | 否 | 可 | 可 | 否 | 否 | 同上 |
| `GET /api/v1/receiving-sessions/{session_no}/placement-suggestions/{barcode}` | 否 | 否 | 可 | 否 | 否 | 仅店长或本店管理会话 |
| `POST /api/v1/receiving-sessions/{session_no}/batches` | 否 | 否 | 可 | 否 | 否 | 仅店长记录签收批次 |
| `POST /api/v1/receiving-sessions/{session_no}/finalize` | 否 | 否 | 可 | 否 | 否 | 仅店长完成收货会话 |

## 7.6 打印接口

| 接口 | `warehouse_supervisor` | `area_supervisor` | `store_manager` | `store_clerk` | `cashier` | 规则 |
| --- | --- | --- | --- | --- | --- | --- |
| `POST /api/v1/print-jobs/labels` | 可 | 否 | 否 | 否 | 否 | 仓库标签打印 |
| `POST /api/v1/warehouse/receipts/{receipt_no}/print-jobs/labels` | 可 | 否 | 否 | 否 | 否 | 仓库标签打印 |
| `POST /api/v1/print-jobs/transfers/{transfer_no}` | 可 | 否 | 否 | 否 | 否 | 仓库打印调拨单 |
| `POST /api/v1/print-jobs/transfers/{transfer_no}/dispatch-bundle` | 可 | 否 | 否 | 否 | 否 | 仓库生成 dispatch bundle |
| `GET /api/v1/print-jobs` | 可 | 否 | 可 | 可 | 否 | 店长看本店相关；店员只看自己打印任务；仓库主管看仓库打印 |
| `GET /api/v1/print-jobs/{job_id}` | 可 | 否 | 可 | 可 | 否 | 同上 |
| `GET /api/v1/print-jobs/{job_id}/preview` | 可 | 否 | 可 | 可 | 否 | 同上 |
| `POST /api/v1/print-jobs/{job_id}/complete` | 可 | 否 | 否 | 可 | 否 | 仓库打印由仓库主管完成；门店商品补打由店员完成 |
| `POST /api/v1/print-jobs/{job_id}/fail` | 可 | 否 | 否 | 可 | 否 | 同上 |

## 7.7 销售、班次、交接接口

| 接口 | `warehouse_supervisor` | `area_supervisor` | `store_manager` | `store_clerk` | `cashier` | 规则 |
| --- | --- | --- | --- | --- | --- | --- |
| `POST /api/v1/sales` | 否 | 否 | 否 | 否 | 可 | 必须命中 POS 强校验 |
| `GET /api/v1/sales` | 否 | 可 | 可 | 否 | 可 | 区域经理看区域；店长看本店；收银员仅看本人班次或本人单据 |
| `POST /api/v1/pos/shifts/open` | 否 | 否 | 否 | 否 | 可 | POS 强校验 |
| `GET /api/v1/pos/shifts` | 否 | 可 | 可 | 否 | 可 | 收银员仅本人；店长仅本店；区域经理仅区域 |
| `POST /api/v1/pos/shifts/{shift_no}/close` | 否 | 否 | 否 | 否 | 可 | 仅当前班次收银员 |
| `POST /api/v1/pos/shifts/{shift_no}/handover-request` | 否 | 否 | 否 | 否 | 可 | 仅当前班次收银员 |
| `POST /api/v1/pos/handovers/{handover_no}/review` | 否 | 可 | 可 | 否 | 否 | 店长一级复核；区域经理终审 |
| `GET /api/v1/pos/handovers` | 否 | 可 | 可 | 否 | 可 | 收银员仅本人；店长本店；区域经理区域 |
| `GET /api/v1/pos/shifts/{shift_no}/t-report` | 否 | 可 | 可 | 否 | 可 | 收银员仅本人班次；店长本店；区域经理区域 |
| `GET /api/v1/pos/shifts/{shift_no}/z-report` | 否 | 可 | 可 | 否 | 可 | 同上 |

## 7.8 作废、退款、支付异常接口

| 接口 | `warehouse_supervisor` | `area_supervisor` | `store_manager` | `store_clerk` | `cashier` | 规则 |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/sales/void-requests` | 否 | 可 | 可 | 否 | 否 | 区域经理看区域；店长看本店 |
| `POST /api/v1/sales/{order_no}/void-request` | 否 | 否 | 否 | 否 | 可 | 仅收银员发起 |
| `POST /api/v1/sales/void-requests/{void_no}/review` | 否 | 可 | 可 | 否 | 否 | 店长一级审批；区域经理升级或终审 |
| `GET /api/v1/sales/refund-requests` | 否 | 可 | 可 | 否 | 否 | 区域经理看区域；店长看本店 |
| `POST /api/v1/sales/{order_no}/refund-request` | 否 | 否 | 否 | 否 | 可 | 仅收银员发起 |
| `POST /api/v1/sales/refund-requests/{refund_no}/review` | 否 | 可 | 可 | 否 | 否 | 店长一级审批；区域经理升级或终审 |
| `GET /api/v1/payments/anomalies` | 否 | 可 | 可 | 否 | 可 | 收银员仅本人班次相关；店长本店；区域经理区域 |
| `POST /api/v1/payments/anomalies/{anomaly_no}/resolve` | 否 | 可 | 可 | 否 | 否 | 店长处理普通异常；区域经理处理升级和现金异常 |

## 7.9 退仓、库存、审计接口

| 接口 | `warehouse_supervisor` | `area_supervisor` | `store_manager` | `store_clerk` | `cashier` | 规则 |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/v1/stores/{store_code}/return-candidates` | 否 | 可 | 可 | 否 | 否 | 区域经理区域；店长本店 |
| `POST /api/v1/returns` | 否 | 否 | 可 | 否 | 否 | 店长创建退仓单 |
| `POST /api/v1/returns/from-selection` | 否 | 否 | 可 | 否 | 否 | 店长创建退仓单 |
| `GET /api/v1/returns` | 可 | 可 | 可 | 否 | 否 | 仓库主管看回仓相关；区域经理看区域；店长看本店 |
| `GET /api/v1/returns/{return_no}` | 可 | 可 | 可 | 否 | 否 | 同上 |
| `POST /api/v1/returns/{return_no}/dispatch` | 否 | 否 | 可 | 否 | 否 | 店长发起本店退仓发出 |
| `POST /api/v1/returns/{return_no}/receive` | 可 | 否 | 否 | 否 | 否 | 仓库主管签收入仓 |
| `GET /api/v1/inventory-adjustments` | 否 | 可 | 可 | 否 | 否 | 店长本店；区域经理区域 |
| `GET /api/v1/inventory-movements` | 可 | 可 | 可 | 否 | 否 | 按各自数据范围过滤 |
| `GET /api/v1/audit-events` | 可 | 可 | 可 | 否 | 否 | 严格按数据范围过滤 |

## 8. 对当前 5 个角色一律拒绝的接口

以下接口不在本轮 5 角色开放范围内，后端应统一拒绝：

- `POST /api/v1/stores`
- `POST /api/v1/suppliers`
- `POST /api/v1/cargo-types`
- `GET /api/v1/roles`
- `POST /api/v1/users`
- `GET /api/v1/users`
- `GET /api/v1/settings/barcode`
- `GET /api/v1/settings/label-templates`
- `POST /api/v1/pricing/rules`
- `GET /api/v1/pricing/rules`
- `POST /api/v1/products`
- `GET /api/v1/products`
- 中国来源 / 中国成本 / 标准件重等中国侧仓库接口
- M-Pesa 导入类接口
- 系统重置与测试接口

备注：

- 若未来要给区域运营经理开放“限价规则”，应在下一版单独补授权，不要顺手放开全部 `/pricing/*`。

## 9. 建议的后端实现切分

建议新增统一鉴权辅助函数：

- `require_active_role()`
- `require_device_type()`
- `require_store_scope()`
- `require_region_scope()`
- `require_assigned_employee_scope()`
- `require_pos_shift_context()`

建议把每个接口的鉴权拆成显式代码，不要写成模糊布尔逻辑。

## 10. 本文档的落地结论

V1 后端鉴权必须从“登录即可调用”升级到“按角色、设备、数据范围、动作硬拒绝”。

最关键的三条是：

- `store_clerk` 必须补成独立角色代码
- `cashier` 的 POS 接口必须增加班次、设备、会话三重校验
- `area_supervisor` 必须具备区域调拨、现金巡收、新店筹划权限，但不得越界做仓库实操、店员实操、POS 实操
