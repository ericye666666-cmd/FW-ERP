# Frontend Prototype

这是第一期浏览器原型，不需要额外前端框架。

现在页面已经按工作区拆开，而且每个工作区内部也改成“单独步骤页跳转”，不再把所有表单堆在一页里。
最新结构是：一级工作区放在顶部横向导航，二级步骤放在左侧边栏，右侧只显示当前业务页面。
- 今日总览
- 包裹分拣
- 仓库建货
- 调拨上架
- 收银结算
- 线上与离线
- 系统管理

地址栏现在也会记住当前步骤页，浏览器前进 / 后退时会跟着切回对应页面。
而且像包裹入仓、分拣、收货、调拨这些关键步骤，做完后会在结果卡片里直接给你“下一步”按钮，不用自己再翻页面找。
现在包裹分拣最前面还新增了一步“运输 / 关单主档”：
- 先录海运柜号 / 关单号 / 卸柜日期 / COC 清单
- 可以把 COC、关单、原单证图片一起上传进去
- 再做包裹入仓
- 做完总确认后，可以单独打开“查看 bale barcode”页面核对每一包的码
- “查看 bale barcode” 现在支持筛选、加入待打印、编辑打印份数、确认打印；打印后原列表会标记“已打印”
- 同一柜多个供应商可以重复选同一个运输主档继续入仓
- 读取“包裹批次目录”后，会按船单聚合成一张张目录卡
- 点开某个船单，就能看到这一柜里有哪些包裹批次、总包裹数，以及对应的 COC / 原单证图片

供应商现在也改成了统一主数据：
- 包裹入仓、商品建档、仓库收货都先从下拉框选择供应商
- 如果下拉里没有，就可以直接在当前页面新建供应商
- 新建成功后会自动回填并选中，不用跳到别的页面再回来

包裹入仓现在不再填“货物类型”，而是直接按：
- 供应商
- 包裹数量
- 包裹 KG
- 商品大类
- 商品小类
- 备注
逐行录入；其中大类 / 小类已经改成二级联动下拉，单选即可。

而且收货、调拨、销售、退款、M-Pesa 导入、离线补录这些常用明细，已经逐步改成可加行的明细表，不需要手写 JSON。

## 用途

- 快速演示后台管理台长什么样
- 直接对接当前 FastAPI 接口
- 先验证业务流，再决定正式前端框架

## 当前覆盖

- Login / logout
- Dashboard
- Store operating summary board
- Store closing checklist board
- Store and settings preview
- Store master creation
- User / role setup
- Inbound shipment master for sea freight / local purchase
- Parcel batch intake
- Sorting task creation
- Sorting result confirmation
- Sorting stock lookup
- Product creation
- Warehouse price rule creation
- Label print queue
- Receipt-based label queue
- Warehouse receipt posting
- Transfer creation
- Transfer approval
- Batch transfer receiving session
- Discrepancy approval
- Transfer print queue
- Print preview
- Mark print jobs printed / failed
- Inventory movement ledger lookup
- Store rack initialization
- Store rack assignment
- Barcode stock lookup for POS
- POS sale posting
- Sale void request / review
- Sale refund / return request / review
- Price cap aware barcode lookup
- Cashier shift open
- Cashier handover request
- Manager handover review
- T / Z report lookup
- FIFO batch cost aware sale profit output
- Whole-store / partial return workflow
- Red price alert panel
- Checkbox-based return selection for whole-store and partial cycle returns
- Red alert summary board for price overrides and price cap breaches
- Safaricom / M-Pesa collection import
- Safaricom callback-style ingest simulation
- M-Pesa customer insights
- Offline sale sync batch upload
- Operations anomaly board for unmatched M-Pesa and offline sync failures
- Payment anomaly board for underpaid / overpaid / duplicate payment cases
- Sale void board for cashier mistakes and same-shift cancellation flow
- Live table lookup
  - including audit log

## 使用方式

1. 启动后端 API
2. 优先直接打开后端挂载页面 `/app/`
3. 或者单独用浏览器打开 `index.html`
4. 确认页面顶部 `API Base URL` 指向正确地址
5. 先用演示账号登录
6. 再依次测试商品、生成条码、收货、限价规则、调拨、分批收货、销售、交接班

现在“周期退仓”已经不是手填 JSON 了：
- 先读取门店可退清单
- 选择“整店退仓”或“只退部分商品”
- 用勾选方式选择商品
- 再一键生成退仓单

“红色价格预警”也不再只是原始日志，而是会显示：
- 今日预警总数
- 超限价次数
- 改价次数
- 每条预警的门店、条码、建议价、成交价、限价和原因

“支付异常单”现在会集中显示：
- 少付
- 多付
- 重复付款
- 未匹配 M-Pesa
- 重复导入的 M-Pesa 收据

并且支持店长或区域主管直接在页面上做“处理完成”留痕。
现在进一步支持按动作处理：
- 少付：补款完成 / 店长批准短款
- 多付 / 重复付款：已退款 / 待退款 / 转门店余额 / 误报
- 未匹配 M-Pesa：匹配到销售单 / 转到本公司其他门店 / 外部号码人工跟进

“作废单”现在会集中显示：
- 哪些销售单待作废审核
- 谁发起的
- 原订单号 / 门店 / 班次 / 销售额
- 店长审核后是否已经真正回库存

并且支持：
- 收银员或店长发起作废申请
- 店长或区域主管审核
- 审核通过后自动把库存回补、并从班次报表和门店摘要里扣掉这笔销售

“顾客退货 / 退款单”现在会集中显示：
- 哪些退款申请待审核
- 原订单号 / 门店 / 原班次 / 退款班次
- 每张单退了哪些商品、退了多少钱
- 店长审核后是否已经真正回补库存

并且支持：
- 收银员或店长按原销售单发起退款申请
- 支持部分退货，不需要整单退
- 店长或区域主管审核
- 审核通过后原销售单不会删除，但会进入 `partially_refunded` / `refunded`
- T-report / Z-report / 门店经营摘要会按退款金额冲减当天净销售

现在也可以直接在页面里测试：
- 导入 Safaricom / M-Pesa 收款流水
- 模拟一条 Safaricom 回调直接入账
- 查看熟客汇总
- 提交离线销售同步批次

首页现在还会直接显示：
- 今日 M-Pesa 金额
- 未匹配 M-Pesa 数
- 熟客数
- 今日离线同步批次
- 今日离线失败行
- 待处理支付异常数

并且新增了“门店经营摘要”，会按门店直接显示：
- 今日销售额
- 今日退款额
- 今日毛利
- 今日销量 / 单数 / 客单
- 当前库存件数 / SKU 数
- 待收调拨 / 待批差异 / 待退仓
- 待退款申请
- 待处理支付异常
- 开班中 / 待交班
- 红色价格预警

每张门店摘要卡片现在还能一键：
- 去做关店结算
- 去做周期退仓

并且新增了“店铺结束营业检查”面板，会直接告诉你：
- 这家店今天该先处理什么
- 还有哪些班次没关
- 哪些交班还在等店长确认
- 当前是否已经可以直接去结算 Z-report
- 今日退款额

现在“店铺结束营业检查”还会直接把这家店的：
- 待处理支付异常
- 待审核作废单
- 待审核退款单
- 待店长确认交班

一起列出来，并提供一键带入对应处理表单的按钮，方便你按关店顺序逐项处理。

收银区现在还新增了一个中文“结算摘要”区域：
- 开班后会显示当前班次状态
- 交班后会显示交班结果和现金差异
- 读取 T-report / Z-report 后会显示中文摘要卡片
- 结算完成后可以直接打开“日报 / Z-report 预览”

销售、作废单、退款单、支付异常单这几块现在也开始改成中文结果卡片：
- 销售后直接显示销售额、毛利、支付状态、异常数
- 作废审核后直接显示是否已回库存
- 退款审核后直接显示退款金额和冲回毛利
- 支付异常处理后直接显示处理动作、金额和修正后的订单/门店

仓库、调拨、分批签收、退仓这几块现在也开始改成中文结果卡片：
- 标签打印后直接显示任务数、总份数和打印机
- 收货后直接显示收了多少 SKU、多少件、进了哪个仓
- 调拨建议会直接显示建议商品数和建议总件数
- 调拨单、调拨审核、发货打印会直接显示当前状态
- 门店分批收货会直接显示批次数、已收总件数和差异数量
- 整店/部分退仓会直接显示当前退仓单状态和总件数

商品建档、绑码、货架位和实时数据查看也开始去“原始 JSON”化：
- 新建商品后直接显示商品档案摘要
- 绑定 barcode 后直接显示商品 / barcode / 模板信息
- 货架模板、初始化和门店货架位分配都会显示中文摘要
- 实时数据查看会先显示当前数据类型、总条数和前几条样本卡片

登录、配置和管理区也一起收成了中文摘要：
- 登录后直接显示当前账号、角色和默认门店
- 系统配置会直接显示门店数、条码规则和标签模板
- 门店管理、用户权限、限价规则都会显示创建结果和当前数量
- 扫码查货会直接显示门店库存、建议售价、限价和门店架位
- M-Pesa 和离线同步也会显示“最近一次处理结果”摘要

并且新增了一块“线上收款 / 离线同步异常”面板，用来集中看：
- 未匹配 M-Pesa
- 重复 M-Pesa
- 离线同步失败
- 离线同步重复

现在销售返回结果里会直接带上：
- `average_cost_price`
- `lot_allocations`
- `line_profit`

这意味着前端已经能看到每一单到底消耗了哪些批次、按什么成本出的货。

如果页面是从后端 `/app/` 打开的，会默认自动连同域 `/api/v1`。

## 默认演示账号

- `admin_1`
- `warehouse_clerk_1`
- `warehouse_supervisor_1`
- `store_manager_1`
- `cashier_1`
- `area_supervisor_1`

默认演示密码：

- `demo1234`
