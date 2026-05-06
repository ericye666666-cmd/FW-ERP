const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

const requiredTerms = [
  ["门店收货主控台", "Store Receiving Command Center"],
  ["仓库发货", "Warehouse Dispatch"],
  ["配送批次", "Delivery Batch"],
  ["调拨单", "Transfer Order"],
  ["门店送货执行单", "Store Delivery Order"],
  ["来源包", "Source Package"],
  ["商品码", "Store Item Barcode"],
  ["货架位", "Rack"],
  ["店员分配", "Clerk Assignment"],
  ["待上架", "Ready for Shelf"],
  ["去上架", "Go to Shelf"],
  ["打印商品码", "Print Item Labels"],
  ["标记本次已打印", "Mark Printed"],
  ["经营分析", "Business Analytics"],
  ["销售记录", "Sales Records"],
];

const preQaTerms = [
  ["手动补货申请", "Manual Replenishment Request"],
  ["仓库备货任务", "Warehouse Prep Task"],
  ["补货申请单", "Replenishment Request"],
  ["补差拣货单", "LPK Shortage Pick Task"],
  ["仓库执行", "Warehouse Execution"],
  ["门店收货", "Store Receiving"],
  ["店员上架", "Clerk Putaway"],
  ["商品篮", "Basket"],
  ["结账区", "Checkout"],
  ["完成销售", "Complete Sale"],
  ["打印助手", "Print Agent"],
  ["下载 Windows 打印助手", "Download Windows Print Agent"],
];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("global language toggle is available outside the POS terminal", () => {
  assert.match(indexHtml, /data-global-language="zh"/);
  assert.match(indexHtml, /data-global-language="en"/);
  assert.match(indexHtml, /id="authLanguageToggle"/);
  assert.match(indexHtml, /id="workspaceLanguageToggle"/);
});

test("pre-QA terminology uses the approved bilingual glossary", () => {
  for (const [zh, en] of preQaTerms) {
    assert.match(appJs + indexHtml, new RegExp(escapeRegex(zh)));
    assert.match(appJs, new RegExp(escapeRegex(en)));
  }
  [
    "Payment & Checkout",
    "Outstanding balance",
    "Barcode / identity / price lookup",
    "补差打包工单",
    "Shortage Pick-Pack Order",
    "备货波次",
    "Step 1",
    "Step 2",
    "Lane A",
    "Lane B",
    "Lane C",
    "shipment_batch_no",
    "driver/vehicle",
    "shipment session",
    "路线 / stops",
    "目标门店 / target stores",
  ].forEach((copy) => {
    assert.doesNotMatch(appJs + indexHtml, new RegExp(escapeRegex(copy)));
  });
});

test("pre-QA error and empty-state copy gives a clear next step in both languages", () => {
  const requiredCopy = [
    ["打印助手未连接，请先启动 Windows 打印助手。", "Print Agent is not connected. Please start the Windows Print Agent first."],
    ["此码不能用于 POS 销售，请扫描 STORE_ITEM 商品码。", "This code cannot be sold in POS. Please scan a STORE_ITEM code."],
    ["这是 SDO，请去门店收货页面处理。", "This is an SDO. Please process it on the Store Receiving page."],
    ["这是 SDB / LPK 来源包，不能直接上架销售。", "This is an SDB / LPK source package. It cannot be put away for sale directly."],
    ["这是 RAW_BALE，门店不能处理。", "This is a RAW_BALE. Stores cannot process it."],
    ["请扫描 STORE_ITEM 商品码。", "Please scan a STORE_ITEM code."],
    ["商品篮为空。请扫描 STORE_ITEM 商品码。", "The basket is empty. Please scan a STORE_ITEM code."],
    ["暂无仓库备货任务。请先生成补货申请单，再生成仓库备货任务。", "No Warehouse Prep Task yet. Create a Replenishment Request first, then generate a Warehouse Prep Task."],
  ];
  for (const [zh, en] of requiredCopy) {
    assert.match(appJs + indexHtml, new RegExp(escapeRegex(zh)));
    assert.match(appJs, new RegExp(escapeRegex(en)));
  }
});

test("global i18n glossary contains the required business terms", () => {
  assert.match(appJs, /GLOBAL_I18N_GLOSSARY/);
  for (const [zh, en] of requiredTerms) {
    assert.match(appJs, new RegExp(zh.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(appJs, new RegExp(en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("global i18n engine translates text and attributes across dynamic pages", () => {
  assert.match(appJs, /function setGlobalLanguage/);
  assert.match(appJs, /function applyGlobalI18n/);
  assert.match(appJs, /function translateI18nText/);
  assert.match(appJs, /function replaceKnownI18nSegments/);
  assert.match(appJs, /GLOBAL_I18N_SEGMENT_ENTRIES/);
  assert.match(appJs, /function getI18nText/);
  assert.match(appJs, /placeholder/);
  assert.match(appJs, /MutationObserver/);
  assert.match(appJs, /data-global-language/);
});

test("workspace navigation uses stable bilingual labels instead of raw Chinese menu text", () => {
  assert.match(appJs, /function getWorkspaceSectionTitle/);
  assert.match(appJs, /function getWorkspaceNavTitle/);
  assert.match(appJs, /function getWorkspacePanelTitle/);
  assert.match(appJs, /titleEn:\s*"Garment Inbound"/);
  assert.match(appJs, /titleEn:\s*"Department-Store Inbound"/);
  assert.match(appJs, /titleEn:\s*"Work Orders"/);
  assert.match(appJs, /titleEn:\s*"Store Replenishment"/);
  assert.match(appJs, /titleEn:\s*"Bale Sales"/);
  assert.match(appJs, /titleEn:\s*"Warehouse General Management"/);
  assert.match(appJs, /titleEn:\s*"China Management"/);
  assert.match(appJs, /titleEn:\s*"Store Manager"/);
  assert.match(appJs, /titleEn:\s*"Store Clerk"/);
  assert.match(appJs, /titleEn:\s*"Cashier Area"/);
  assert.match(appJs, /titleEn:\s*"System Admin"/);
  assert.match(appJs, /titleEn:\s*"Roles & OA"/);
  assert.match(appJs, /navTitleEn:\s*"Users & Accounts"/);
  assert.match(appJs, /getWorkspaceSectionTitle\(section/);
  assert.match(appJs, /getWorkspaceNavTitle\(panel/);
  assert.match(appJs, /getWorkspacePanelTitle\(current/);
});

test("first batch workspace page titles and core business terms have natural English keys", () => {
  const phrases = [
    ["0.1 原始 Bale 总库存", "0.1 Raw Bale Inventory"],
    ["原始 Bale 总库存", "Raw Bale Inventory"],
    ["未分拣", "Unsorted"],
    ["已分拣", "Sorted"],
    ["读取原始 bale 总库存", "Load Raw Bale Inventory"],
    ["0.1 创建分拣任务", "0.1 Create Sorting Task"],
    ["0.1.2 压缩工单管理", "0.1.2 Compression Work Orders"],
    ["4. 门店补货建议", "4. Store Replenishment Suggestions"],
    ["4.1 手动补货需求", "4.1 Manual Replenishment Request"],
    ["5.1 LPK 补差拣货", "5.1 LPK Shortage Pick Task"],
    ["6. 仓库执行单 / 出库打印", "6. Warehouse Execution / Dispatch Print"],
    ["6.1 配送批次 / 门店收货跟踪", "6.1 Delivery Batch / Store Receiving Tracking"],
    ["5. 门店收货主控台", "5. Store Receiving Command Center"],
    ["6.2 我的当前 bale", "6.2 My Current Bales"],
    ["收银销售", "Cashier Shift & POS Sales"],
    ["高速收银终端", "Fast POS Terminal"],
    ["数据管理", "Data Management"],
    ["账号 / 用户", "Users & Accounts"],
    ["全部销售数据", "All Sales Data"],
    ["门店销售汇总", "Store Sales Summary"],
  ];
  for (const [zh, en] of phrases) {
    assert.match(appJs, new RegExp(zh.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(appJs, new RegExp(en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("raw bale inventory dynamic copy uses the shared i18n helper for visible cards and empty states", () => {
  const rawBaleRenderer = (appJs.match(/function renderRawBaleStockSummary[\s\S]*?function renderWarehouseSortedInventorySection/) || [""])[0];
  assert.match(rawBaleRenderer, /chooseI18nLabel\(/);
  assert.match(rawBaleRenderer, /Raw Bale Inventory/);
  assert.match(rawBaleRenderer, /Load Raw Bale Inventory/);
  assert.match(rawBaleRenderer, /Unsorted/);
  assert.match(rawBaleRenderer, /Sorted/);
  assert.match(rawBaleRenderer, /Current Warehouse Inventory/);
  assert.match(rawBaleRenderer, /B2B Sold Packages/);
  assert.match(rawBaleRenderer, /No raw bales match the current search/);
});

test("priority mainline phrases have natural English translations", () => {
  const phrases = [
    ["登录系统", "Sign in"],
    ["用户名", "Username"],
    ["密码", "Password"],
    ["退出登录", "Log out"],
    ["账号 / 用户", "Users & Accounts"],
    ["系统管理", "System Admin"],
    ["仓库执行单 / 出库打印", "Warehouse Execution / Dispatch Print"],
    ["确认当前标签已贴标", "Mark Current Label Completed"],
    ["确认本批已贴标", "Mark Batch Labeling Completed"],
    ["下一阶段：仓库送货执行单 / 配送批次", "Next stage: Store Delivery Order / Delivery Batch"],
    ["添加调拨单 / 加一行", "Add transfer order row"],
    ["开始验收", "Start receiving check"],
    ["确认收到此包", "Confirm package received"],
    ["整单验收完成", "Complete SDO receiving"],
    ["分配给店员", "Assign to Clerk"],
    ["我的当前 bale", "My Current Bales"],
    ["我的待上架包列表", "My Ready-for-Shelf Packages"],
    ["包上架 / 商品码打印", "Package Shelving / Item Label Printing"],
    ["选择售价", "Select selling price"],
    ["生成 STORE_ITEM 商品码", "Create Store Item Barcodes"],
    ["完成销售", "Complete Sale"],
    ["这不是商品码，不能收银。请扫描 STORE_ITEM 商品条码。", "This is not an item barcode and cannot be sold. Please scan a STORE_ITEM barcode."],
    ["全部销售数据", "All Sales Data"],
    ["门店销售汇总", "Store Sales Summary"],
    ["来源链路", "Source Trace"],
  ];
  for (const [zh, en] of phrases) {
    assert.match(appJs, new RegExp(zh.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(appJs, new RegExp(en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("global i18n uses natural ERP wording and avoids awkward translations", () => {
  const requiredNaturalPhrases = [
    "Current Label Completed",
    "Batch Labeling Completed",
    "Ready for Dispatch",
    "Assign to Clerk",
    "Print Item Labels",
    "Create Store Item Barcodes",
    "Sales Records",
    "Business Analytics",
    "当前标签已贴标",
    "本批已贴标",
    "已贴标待送店",
    "商品码打印",
    "包上架",
  ];
  for (const phrase of requiredNaturalPhrases) {
    assert.match(appJs, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  const awkwardPhrases = [
    "Goods receiving bales",
    "This type already paste finished",
    "Package has been sticked",
    "barcode 流转工作台",
    "本类已粘贴",
  ];
  for (const phrase of awkwardPhrases) {
    assert.doesNotMatch(appJs, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(indexHtml, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("dynamic status translation covers store item, dispatch, receipt and sale states", () => {
  assert.match(appJs, /const GLOBAL_I18N_STATUS_LABELS/);
  assert.match(appJs, /function translateStatusLabel/);
  const statuses = [
    ["pending_print", "Pending Print", "待打印"],
    ["labelled", "Labelled", "已贴标"],
    ["ready_to_dispatch", "Ready for Dispatch", "已贴标待送店"],
    ["in_transit", "In Transit", "配送中"],
    ["pending_receipt", "Pending Store Receipt", "待门店签收"],
    ["received", "Received", "已验收"],
    ["assigned", "Assigned", "已分配"],
    ["ready_for_sale", "Ready for Sale", "可销售"],
    ["sold", "Sold", "已售出"],
  ];
  for (const [status, en, zh] of statuses) {
    assert.match(appJs, new RegExp(status.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(appJs, new RegExp(en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(appJs, new RegExp(zh.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(appJs, /translateStatusLabel\(status,\s*"store_dispatch_bale"/);
  assert.match(appJs, /translateStatusLabel\(status,\s*"store_receipt_package"/);
  assert.match(appJs, /translateStatusLabel\(status,\s*"store_item"/);
  assert.match(appJs, /translateStatusLabel\(value,\s*"bale_sales_candidate"/);
  assert.match(appJs, /ready_dispatch:\s*\{\s*zh:\s*"已贴标待送店",\s*en:\s*"Ready for Dispatch"\s*\}/);
  assert.match(appJs, /pending_acceptance:\s*\{\s*zh:\s*"待门店签收",\s*en:\s*"Pending Store Receipt"\s*\}/);
});

test("acceptance pages have natural page-level English copy", () => {
  const phrases = [
    ["检测本地打印代理", "Check local print agent"],
    ["通过本地代理打印", "Print via local agent"],
    ["发送到打印站", "Send to print station"],
    ["用浏览器打印", "Use browser print"],
    ["条码识别测试", "Barcode Resolver Test"],
    ["测试条码", "Test barcode"],
    ["一键测试全部场景", "Test all contexts"],
    ["读取最近送货单", "Load recent deliveries"],
    ["返回到货列表", "Back to arrivals"],
    ["到货列表", "Arrivals"],
    ["验收详情", "Receiving Details"],
    ["分配店员", "Assign Clerk"],
    ["刷新我的任务", "Refresh My Tasks"],
    ["本次打印数量", "Print Quantity"],
    ["预览本次商品码", "Preview Item Labels"],
    ["打印本次数量", "Print This Batch"],
    ["请先选择货架位", "Please select a rack first"],
    ["请先选择售价", "Please select a selling price first"],
    ["配送批次数量", "Delivery Batches"],
    ["待发车批次", "Pending Dispatch"],
    ["运输中批次", "In Transit"],
    ["已完成批次", "Completed Batches"],
    ["涉及门店数", "Stores Covered"],
    ["总包数", "Total Packages"],
    ["总件数", "Total Items"],
    ["配送批次号", "Delivery Batch No."],
    ["司机", "Driver"],
    ["车辆", "Vehicle"],
    ["预计出发时间", "Estimated Departure"],
    ["路线", "Route"],
    ["目标门店", "Target Store"],
    ["每个门店收货状态", "Store Receipt Status"],
    ["今日销售额", "Today's Sales"],
    ["当前没有生成销售记录。", "No sales records generated yet."],
  ];
  for (const [zh, en] of phrases) {
    assert.match(appJs, new RegExp(zh.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(appJs, new RegExp(en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("cashier sales page copy is covered by global i18n", () => {
  const phrases = [
    ["9. 收银销售", "9. Cashier Shift & POS Sales"],
    ["收银功能区", "Cashier Area"],
    ["作废单", "Voided Orders"],
    ["顾客退货 / 退款单", "Customer Returns / Refunds"],
    ["支付异常单", "Payment Exceptions"],
    ["Safaricom / M-Pesa", "Safaricom / M-Pesa"],
    ["离线销售同步", "Offline Sales Sync"],
    ["门店代码", "Store Code"],
    ["开班备用金", "Opening Cash Float"],
    ["备注", "Notes"],
    ["班次号", "Shift No."],
    ["实收现金", "Actual Cash Received"],
    ["补充说明，可写异常原因、交接备注或审批说明。", "Add notes for exceptions, handover, or approval."],
    ["班次号一般开班后自动带出，不用手记。", "Shift No. is generated after opening a shift. You do not need to remember it manually."],
    ["开班", "Open Shift"],
    ["查看 T-report", "View T-report"],
    ["查看 Z-report", "View Z-report"],
    ["早班开始", "Morning shift started"],
    ["当前显示", "Current View"],
    ["店铺进销存工作台", "Retail Ops Workspace"],
    ["当前用户 / 角色 / 门店", "Current User / Role / Store"],
    ["退出登录", "Log out"],
  ];
  for (const [zh, en] of phrases) {
    assert.match(appJs + indexHtml, new RegExp(zh.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(appJs, new RegExp(en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("priority visible buttons avoid Chinese and English mixed labels", () => {
  const mixedLabels = [
    "检测本地打印代理 / Check local print agent",
    "通过本地代理打印 / Print via local agent",
    "发送到打印站 / Send to print station",
    "用浏览器打印 / Use browser print",
    "条码识别测试 / Barcode resolver test",
    "测试条码 / Test barcode",
    "一键测试全部场景 / Test all contexts",
    "门店收货主控台 / Store Receiving Command Center",
    "读取最近送货单 / Load recent deliveries",
    "查看 Z-report / View Z-report",
  ];
  for (const label of mixedLabels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.doesNotMatch(indexHtml, new RegExp(escaped));
    assert.doesNotMatch(appJs, new RegExp(escaped));
  }
});

test("user management generated field labels and help copy are translated", () => {
  const phrases = [
    ["姓名", "Full Name"],
    ["角色代码", "Role"],
    ["仓库代码", "Warehouse Code"],
    ["区域代码", "Area Code"],
    ["管辖门店", "Managed Stores"],
    ["临时密码", "Temporary Password"],
    ["填写要登录的账号，例如 admin_1 或 cashier_1。", "Enter the account username, for example admin_1 or cashier_1."],
    ["填写员工真实姓名，方便审计日志和权限管理。", "Enter the staff member's real name for audit logs and access control."],
    ["选择角色，例如 admin、cashier、store_manager。", "Select a role such as admin, cashier, or store_manager."],
    ["填写所属门店代码；如果是总管理员可留系统默认。", "Enter the assigned store code. Leave blank for global admin accounts."],
    ["当前先用主仓编码，例如 WH1。", "Enter the warehouse code, for example WH1."],
    ["请填写：区域代码，例如 NAIROBI-EAST", "Enter the area code, for example NAIROBI-EAST."],
    ["请填写：管辖门店，例如 UTAWALA,KAWANGWARE", "Enter managed stores, for example UTAWALA,KAWANGWARE."],
  ];
  assert.match(appJs, /const FIELD_LABELS_EN/);
  assert.match(appJs, /const FIELD_HELP_EN/);
  assert.match(appJs, /getFieldLabelText[\s\S]*?chooseI18nLabel/);
  assert.match(appJs, /getFieldHelpText[\s\S]*?chooseI18nLabel/);
  for (const [zh, en] of phrases) {
    assert.match(appJs + indexHtml, new RegExp(zh.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(appJs, new RegExp(en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  const mixedPlaceholders = [
    "Store code，如 UTAWALA",
    "Warehouse code，如 WH1",
    "Area code，如 NAIROBI-EAST",
    "Managed stores，如 UTAWALA,KAWANGWARE",
    "Temporary password，编辑时可留空",
  ];
  for (const label of mixedPlaceholders) {
    assert.doesNotMatch(indexHtml, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("warehouse hub navigation descriptions and sorted garment inventory dynamic copy use i18n helpers", () => {
  const warehouseHubRenderer = (appJs.match(/function renderWarehouseBaleHubNav[\s\S]*?function summarizeWarehouseDispatchRows/) || [""])[0];
  const sortingRenderer = (appJs.match(/function renderSortingStockSummary[\s\S]*?function getItemTokenStatusLabel/) || [""])[0];
  const sortingFilterRenderer = (appJs.match(/function renderSortingStockFilter[\s\S]*?function renderSortingStockSummary/) || [""])[0];
  assert.match(warehouseHubRenderer, /chooseI18nLabel\(/);
  assert.match(warehouseHubRenderer, /translateI18nText\(/);
  assert.match(sortingRenderer, /chooseI18nLabel\(/);
  assert.match(sortingFilterRenderer, /chooseI18nLabel\(/);
  const phrases = [
    ["仓库总控页", "Warehouse Control"],
    ["上方 4 个入口分别对应当前 bale 总库存、已分拣服装、门店送货历史和B2B 已售包裹。", "The four shortcuts above cover current raw bale inventory, sorted garment inventory, store delivery history, and B2B sold packages."],
    ["0.3 分拣库存 / 中转区库存", "0.3 Sorted Garment Inventory / Transit Inventory"],
    ["读取已分拣服装", "Load Sorted Garment Inventory"],
    ["分拣完成后的散件先进入中转区库存池。这里按大类/小类/等级汇总，可根据经营需求压成仓库待送店包或待售包。", "Loose items enter transit inventory after sorting. This page summarizes by category, subcategory, and grade, then creates store dispatch packages or bale-sale packages as needed."],
    ["搜索信息", "Search"],
    ["全部库存", "All Inventory"],
    ["全部大类", "All Categories"],
    ["全部件数", "All Quantities"],
    ["左侧散件汇总", "Loose Item Summary"],
    ["右侧成品包", "Finished Packages"],
    ["压成仓库待送店包", "Create Store Dispatch Package"],
    ["压成待售包", "Create Bale Sale Package"],
    ["散件", "Loose Items"],
    ["已悬挂", "Reserved"],
    ["可新建", "Available to Pack"],
    ["成品包", "Finished Packages"],
    ["待送店", "Ready for Store Dispatch"],
    ["待售卖", "Bale Sale"],
    ["当前这个小类没有散件库存。", "No loose inventory for this category."],
    ["当前这个小类还没有打成包的待送店 / 待售卖 bale。", "No finished store-dispatch or bale-sale packages for this category yet."],
    ["补打 barcode", "Reprint Barcode"],
  ];
  for (const [zh, en] of phrases) {
    assert.match(appJs + indexHtml, new RegExp(zh.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(appJs, new RegExp(en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
