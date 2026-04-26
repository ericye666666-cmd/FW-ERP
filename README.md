# Retail Ops Backend

这是第一期后端骨架，目标是先跑通以下闭环：

- 商品建档
- 运输 / 关单主档
- 仓库入库
- 标签打印任务
- 调拨单
- 门店签收与差异确认
- 基础库存和销售摘要
- 收银开班、交接班、店长确认和 T / Z 报表
- 收银作废单申请与店长审核回滚
- 顾客退货 / 退款单申请与店长审核回补
- 仓库限价规则与收银改价红色预警
- FIFO 批次成本追踪与单件利润回溯
- Safaricom / M-Pesa 流水导入与熟客分析
- Safaricom 回调式入账
- 离线销售同步批次

## 计划技术栈

- FastAPI
- PostgreSQL
- 网站端、桌面端、APP 共用同一套后端

## 本阶段说明

当前目录现在提供：

- 接口结构
- 数据 schema
- 可继续扩展的应用入口
- 轻量账号登录与 Bearer 会话
- 第一批可用的业务流：
  - 商品建档
  - 商品列表
  - 运输主档创建 / 列表（海运 / 本地采购）
  - 关单主档支持保存 COC / 原单证图片
  - 包裹入仓时绑定运输主档、关单号和卸柜日期
  - 仓库收货入库
  - 仓库库存查看
  - 标签打印任务创建
  - 按收货单批量排标签
  - 标签打印任务列表
  - 打印任务完成 / 失败回写
  - 调拨单创建 / 审核 / 签收 / 差异审批
  - 门店分批收货会话 / 摆放建议 / 自动差异生成
  - 门店库存查询
  - 批次级 FIFO 成本追踪
  - 库存流水台账
  - 门店货架初始化 / 架位分配
- POS 销售减库存
- 销售作废申请 / 审核 / 库存回补
- 顾客退货 / 退款申请 / 审核 / 库存回补
- 收银开班 / 交班申请 / 店长确认交班
  - T-report / Z-report
- 支付方式统计 / M-Pesa 客户 ID 汇总 / 改价红色预警
- 少付 / 多付 / 重复付款 / 未匹配 M-Pesa 的支付异常单
- 仓库 / 门店维度的限价规则
- 本地 JSON 持久化
- 直接挂载的浏览器原型页面 `/app/`

后续再补：

- 数据库
- ERP 同步
- 打印桥接

## 当前接口

### 系统

- `GET /api/v1/health`
- `GET /api/v1/dashboard/summary`
- `GET /api/v1/dashboard/store-operating-summary`
- `GET /api/v1/dashboard/store-closing-checklist/{store_code}`

### 鉴权

- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`

### 门店与配置

- `GET /api/v1/stores`
- `POST /api/v1/stores`
- `GET /api/v1/suppliers`
- `POST /api/v1/suppliers`
- `GET /api/v1/cargo-types`
- `POST /api/v1/cargo-types`
- `GET /api/v1/roles`
- `POST /api/v1/users`
- `GET /api/v1/users`
- `GET /api/v1/stores/rack-template`
- `POST /api/v1/stores/{store_code}/rack-locations/initialize`
- `GET /api/v1/stores/{store_code}/rack-locations`
- `POST /api/v1/stores/{store_code}/rack-assignments`
- `GET /api/v1/settings/barcode`
- `GET /api/v1/settings/label-templates`

### 定价规则

- `POST /api/v1/pricing/rules`
- `GET /api/v1/pricing/rules`

### 商品

- `POST /api/v1/products`
- `GET /api/v1/products`

### 仓库

- `POST /api/v1/warehouse/inbound-shipments`
- `GET /api/v1/warehouse/inbound-shipments`

- `POST /api/v1/warehouse/receipts`
- `GET /api/v1/warehouse/receipts`
- `GET /api/v1/warehouse/stock`

仓库库存现在会返回：
- `cost_price`：按当前在库批次加权后的成本
- `lot_count`：当前还有多少个在库批次

### 门店库存

- `GET /api/v1/stores/stock`
- `GET /api/v1/stores/{store_code}/stock/{barcode}`
- `GET /api/v1/stores/{store_code}/return-candidates`

门店库存现在同样会返回：
- `cost_price`：按门店当前剩余批次计算的平均成本
- `lot_count`：门店当前剩余批次数

### 打印

- `POST /api/v1/print-jobs/labels`
- `POST /api/v1/warehouse/receipts/{receipt_no}/print-jobs/labels`
- `POST /api/v1/print-jobs/transfers/{transfer_no}`
- `GET /api/v1/print-jobs`
- `GET /api/v1/print-jobs/{job_id}`
- `GET /api/v1/print-jobs/{job_id}/preview`
- `POST /api/v1/print-jobs/{job_id}/complete`
- `POST /api/v1/print-jobs/{job_id}/fail`

### 调拨

- `POST /api/v1/transfers`
- `GET /api/v1/transfers`
- `GET /api/v1/transfers/{transfer_no}`
- `POST /api/v1/transfers/{transfer_no}/approve`
- `POST /api/v1/transfers/{transfer_no}/discrepancy-approval`
- `GET /api/v1/receiving-sessions`
- `GET /api/v1/transfers/{transfer_no}/receiving-sessions`
- `POST /api/v1/transfers/{transfer_no}/receiving-sessions/start`
- `GET /api/v1/receiving-sessions/{session_no}`
- `GET /api/v1/receiving-sessions/{session_no}/placement-suggestions/{barcode}`
- `POST /api/v1/receiving-sessions/{session_no}/batches`
- `POST /api/v1/receiving-sessions/{session_no}/finalize`

### 库存差异

- `GET /api/v1/inventory-adjustments`
- `GET /api/v1/inventory-movements`

### 审计日志

- `GET /api/v1/audit-events`

### 支付异常

- `GET /api/v1/payments/anomalies`
- `POST /api/v1/payments/anomalies/{anomaly_no}/resolve`

支付异常当前会自动覆盖这些场景：
- 销售少付
- 非现金多付
- 同单重复输入付款参考号
- 历史重复付款参考号
- 重复导入的 M-Pesa 收据
- 未匹配到销售单的 M-Pesa 收据

支付异常现在支持按动作处理，而不只是“确认完成”：
- 少付：补款完成 / 店长批准短款
- 多付 / 重复付款：已退款 / 待退款 / 转门店余额 / 误报
- 未匹配 M-Pesa：匹配到销售单 / 转到本公司其他门店 / 外部号码人工跟进

处理后会自动回写：
- 销售单支付状态
- 销售单支付总额、应收差额、多付金额
- M-Pesa 流水匹配状态
- 门店经营摘要和关店检查里的支付异常计数

### 销售作废

- `GET /api/v1/sales/void-requests`
- `POST /api/v1/sales/{order_no}/void-request`
- `POST /api/v1/sales/void-requests/{void_no}/review`

销售作废当前规则：
- 收银员或店长可以发起作废申请
- 店长或区域主管审核
- 审核通过后原销售单保留，但状态会改成 `voided`
- 门店库存会自动回补
- T-report / Z-report / 门店经营摘要不再把这笔作废单算进销售额
- 同订单下未处理的支付异常会自动改成已处理

### 顾客退货 / 退款

- `GET /api/v1/sales/refund-requests`
- `POST /api/v1/sales/{order_no}/refund-request`
- `POST /api/v1/sales/refund-requests/{refund_no}/review`

顾客退货 / 退款当前规则：
- 收银员或店长可以按原销售单发起退款申请
- 支持部分退货，不必整单退
- 店长或区域主管审核
- 审核通过后原销售单保留，但状态会变成 `partially_refunded` 或 `refunded`
- 门店库存会自动按原销售批次回补
- T-report / Z-report / 门店经营摘要会按退款金额冲减当天净销售
- 退款和“周期退仓”是两套独立流程，不会混在一起

### Safaricom / M-Pesa

- `POST /api/v1/integrations/mpesa/import`
- `POST /api/v1/integrations/mpesa/safaricom-callback`
- `GET /api/v1/integrations/mpesa/collections`
- `GET /api/v1/integrations/mpesa/customer-insights`

当前导入后会尽量按：
- 门店
- 金额
- 参考号
- customer_id
- 时间窗口

去自动匹配销售单和班次。

现在也支持一条更接近真实接入的回调入口：
- `POST /api/v1/integrations/mpesa/safaricom-callback`

它可以接：
- 直接整理好的 prototype JSON
- 或类似 Safaricom STK Callback 的 `Body.stkCallback.CallbackMetadata` 结构

Dashboard 现在还会额外显示：
- 今日 M-Pesa 收款
- 未匹配 M-Pesa 数
- 熟客数量
- 今日离线同步批次
- 今日离线失败行
- 待处理支付异常数

另外现在还有一组“门店经营摘要”接口输出，按每家门店汇总：
- 今日销售额
- 今日退款额
- 今日毛利
- 今日销量 / 单数 / 客单
- 当前库存件数 / SKU 数
- 待收调拨 / 待批差异 / 待退仓
- 待退款申请
- 待处理支付异常
- 开班中 / 待交班

`/dashboard/store-closing-checklist/{store_code}` 会进一步给出：
- 开班中的班次列表
- 待店长确认的交接班
- 当前最推荐的关店下一步
- 可直接用于 Z-report 的 `shift_no`
- 今日红色价格预警
- 今日退款额
- 待处理支付异常
- 今日 M-Pesa 与未匹配 M-Pesa
- 今日离线失败行

### 销售

- `POST /api/v1/sales`
- `GET /api/v1/sales`
- `POST /api/v1/sales/offline-sync`
- `GET /api/v1/sales/offline-sync-batches`

销售单行现在会返回：
- `average_cost_price`
- `lot_allocations`
- `line_profit`

也就是说，利润不再只看商品主档成本，而是按真实入店批次 FIFO 扣减后计算。

离线同步批次会记录：
- `sync_batch_no`
- `device_id`
- 接收成功条数
- 重复条数
- 失败条数

### POS / 交接班

- `POST /api/v1/pos/shifts/open`
- `GET /api/v1/pos/shifts`
- `POST /api/v1/pos/shifts/{shift_no}/handover-request`
- `POST /api/v1/pos/handovers/{handover_no}/review`
- `GET /api/v1/pos/handovers`
- `GET /api/v1/pos/shifts/{shift_no}/t-report`
- `GET /api/v1/pos/shifts/{shift_no}/z-report`

### 退仓

- `POST /api/v1/returns`
- `POST /api/v1/returns/from-selection`
- `GET /api/v1/returns`
- `GET /api/v1/returns/{return_no}`
- `POST /api/v1/returns/{return_no}/dispatch`
- `POST /api/v1/returns/{return_no}/receive`

## 预期启动方式

```bash
uvicorn app.main:app --reload
```

启动后：

- API 默认在 `http://127.0.0.1:8000/api/v1`
- 浏览器原型默认在 `http://127.0.0.1:8000/app/`
- 预览标签/调拨单时，前端会自动把当前登录 token 带进预览地址

## 当前数据保存方式

- 运行时数据会自动写到 `backend/data/runtime_state.json`
- 这让原型在重启后还能保留商品、库存、调拨、销售记录
- 正式版再迁移到 PostgreSQL

## 当前默认演示账号

- `admin_1`
- `warehouse_clerk_1`
- `warehouse_supervisor_1`
- `store_manager_1`
- `cashier_1`
- `area_supervisor_1`

默认演示密码：

- `demo1234`

## 当前已启用的角色校验

- 商品建档：仓库员 / 仓库主管 / 管理员
- 仓库收货：仓库员 / 仓库主管 / 管理员
- 标签打印：仓库员 / 仓库主管 / 管理员
- 调拨创建：仓库员 / 仓库主管 / 管理员
- 调拨审批：仓库主管 / 管理员
- 门店签收：店长 / 管理员
- 差异审批：区域主管 / 管理员
- POS 销售：收银员 / 店长 / 管理员
- 门店新增、用户新增：管理员 / 区域主管 / 管理员
- 所有后台接口默认需要先登录，再由后端用当前登录账号覆盖操作者字段
