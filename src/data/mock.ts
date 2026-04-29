export interface NavigationLinkItem {
  label: string;
  href: string;
  description: string;
  external?: boolean;
}

export interface NavigationSectionItem {
  label: string;
  description: string;
  children: NavigationLinkItem[];
}

export interface NavigationGroup {
  title: string;
  items: Array<NavigationLinkItem | NavigationSectionItem>;
}

export const navigationGroups: NavigationGroup[] = [
  {
    title: "指挥台",
    items: [
      {
        label: "AI 指挥台",
        href: "/",
        description: "统一界面、任务看板与智库",
      },
      {
        label: "系统搭建",
        href: "http://127.0.0.1:8000/app/",
        description: "跳转到仓库、运营中心和门店端业务页面",
        external: true,
      },
    ],
  },
  {
    title: "仓库",
    items: [
      {
        label: "包裹入仓",
        href: "/bale-inbound",
        description: "运单总表、入仓明细与标签队列",
      },
      {
        label: "分拣任务",
        href: "/sorting-tasks",
        description: "主管建任务、挑包复核、上架确认",
      },
      {
        label: "分拣工位样稿",
        href: "/sorting-station-preview",
        description: "基于 SAP Horizon 的仓库工位提档预览",
      },
      {
        label: "库位库存",
        href: "/location-inventory",
        description: "货架级库存与库位调整",
      },
      {
        label: "门店收货",
        href: "/store-receiving",
        description: "Page 5/6：SDO 卡片与包级验收状态",
      },
    ],
  },
  {
    title: "销售执行",
    items: [
      {
        label: "Bales销售",
        description: "独立于仓库工单流，处理待售包裹成本表、毛利编辑与真实出库。",
        children: [
          {
            label: "待售包裹",
            href: "/bale-sales/pricing",
            description: "根据船单成本池查看待售 bale，并导出成本与毛利编辑表。",
          },
          {
            label: "真实出库",
            href: "/bale-sales/outbound",
            description: "扫码核销、登记销售人和客户信息，并完成真实出库。",
          },
        ],
      },
    ],
  },
];

export const pageMeta = {
  "/": {
    eyebrow: "AI 指挥",
    title: "UI + 看板 + 智库",
    description: "在同一工作台里查看自动化、推动任务卡片，并随时打开可复用知识。",
  },
  "/bale-inbound": {
    eyebrow: "仓库流程",
    title: "包裹入仓",
    description: "跟踪海运与本地采购总单，确认实物包裹，并把可打印标签送进执行队列。",
  },
  "/sorting-tasks": {
    eyebrow: "主管作业",
    title: "分拣任务",
    description: "创建挑包任务、核对纸面数量，并把确认后的批次释放到上架环节。",
  },
  "/sorting-station-preview": {
    eyebrow: "设计样稿",
    title: "分拣工位样稿",
    description: "以 SAP Horizon 为参考，重做仓库主流程页的工作台层级与交接节奏。",
  },
  "/location-inventory": {
    eyebrow: "库位可视化",
    title: "库位库存",
    description: "查看实时货架密度、异常区域和最后一段的库位修正。",
  },
  "/store-receiving": {
    eyebrow: "门店收货",
    title: "SDO 验收",
    description: "先看 Page 5 送货单状态，再进入 Page 6 完成包级验收。",
  },
  "/bale-sales/pricing": {
    eyebrow: "Bales 销售",
    title: "待售包裹",
    description: "按船单成本池查看候选 bale，编辑成本与毛利，并导出 Excel 成本表。",
  },
  "/bale-sales/outbound": {
    eyebrow: "Bales 销售",
    title: "真实出库",
    description: "用扫码核销完成 bale 销售出库，并登记销售人、客户和付款信息。",
  },
} as const;

export const workspaceSummary = {
  site: "AI 自动化中枢",
  status: "在线工作台",
  note: "一个界面同时承载自动化健康度、交付看板和知识沉淀，仓库流程也能并行查看。",
};

export const aiOverviewStats = [
  { label: "在线自动化", value: "24", meta: "其中 17 个生产循环、5 个预发流程、2 个等待审批" },
  { label: "未完成交付卡", value: "31", meta: "其中 9 项需要在未来 48 小时内完成负责人交接" },
  { label: "知识资产", value: "128", meta: "本季度已整理作战手册、提示词、质检笔记和基准参考" },
  { label: "决策延迟", value: "2.4h", meta: "从信号出现到任务被接手的今日中位耗时" },
];

export const aiLaunchpad = {
  badge: "AI 运营系统",
  title: "把 UI、看板和智库收进同一块指挥台",
  description:
    "直接从工作台开始：盯住在线自动化、推进跨团队任务，并在上下文失效前调出正确的操作手册。",
  primaryAction: "打开交付看板",
  secondaryAction: "查看作战手册",
  briefs: [
    {
      label: "今日判断",
      value: "营收类助手整体稳定，内容质检需要在 18:00 前补齐负责人覆盖。",
    },
    {
      label: "最高杠杆",
      value: "先稳住周度洞察包流水线，再收尾双语提示词工具包的全量发布。",
    },
    {
      label: "最新知识",
      value: "新的升级处理模板让客服自动化的交接延迟下降了 22%。",
    },
  ],
};

export const aiAutomationLoops = [
  {
    name: "洞察包生成器",
    cadence: "每 3 小时",
    state: "正常",
    detail: "上次运行时间 16:20，结果已推送到 Slack、邮件草稿和负责人摘要。",
    owner: "运营 AI",
  },
  {
    name: "活动质检巡检器",
    cadence: "每天 14:00",
    state: "关注中",
    detail: "最新双语文案更新后识别到 3 个缺少兜底区块的地方。",
    owner: "增长运营",
  },
  {
    name: "VIP 挽回助手",
    cadence: "事件触发",
    state: "待补充",
    detail: "下一批重试前还在等待新的留存边界规则下发。",
    owner: "客服小组",
  },
];

export const aiFocusBoard = [
  {
    title: "收尾交付看板打磨",
    detail: "补齐评审状态、移动端拖拽提示和泳道级 SLA 徽标，让新看板更可用。",
    owner: "设计工程",
    eta: "今天 17:30",
  },
  {
    title: "合并提示词评审入口",
    detail: "把提示词评审、QA 备注和上线签收压进同一个分诊表，减少上下文丢失。",
    owner: "自动化 PM",
    eta: "4月18日 10:00",
  },
  {
    title: "刷新合作方手册",
    detail: "给合作方入门文档重新建索引，补齐示例、升级边界和可衡量的成功标准。",
    owner: "赋能团队",
    eta: "4月18日 15:00",
  },
];

export const aiSprintTracks = [
  {
    lane: "待规划",
    count: 6,
    tone: "default",
    items: [
      {
        title: "客户挽回助手 v2",
        owner: "Luna",
        eta: "4月18日",
        score: "P0",
        tags: ["提示词审计", "输入梳理"],
      },
      {
        title: "供应商摘要导出器",
        owner: "Jay",
        eta: "4月19日",
        score: "P1",
        tags: ["表格", "模板"],
      },
    ],
  },
  {
    lane: "开发中",
    count: 8,
    tone: "info",
    items: [
      {
        title: "周度 KPI 摘要",
        owner: "Mika",
        eta: "4月17日",
        score: "紧急",
        tags: ["邮件", "质检"],
      },
      {
        title: "价格监控解析器",
        owner: "Eric",
        eta: "4月18日",
        score: "P1",
        tags: ["抓取", "告警"],
      },
    ],
  },
  {
    lane: "待评审",
    count: 5,
    tone: "warning",
    items: [
      {
        title: "双语活动评分器",
        owner: "Sonia",
        eta: "今天",
        score: "风险",
        tags: ["评估", "中文"],
      },
      {
        title: "退款异常简报",
        owner: "Noah",
        eta: "4月18日",
        score: "P1",
        tags: ["SQL", "叙事"],
      },
    ],
  },
  {
    lane: "待上线",
    count: 4,
    tone: "success",
    items: [
      {
        title: "门店报表自动副驾",
        owner: "Ada",
        eta: "现在",
        score: "可上线",
        tags: ["文档", "交付"],
      },
      {
        title: "升级应答工具包",
        owner: "Kai",
        eta: "4月17日",
        score: "可上线",
        tags: ["手册", "客服"],
      },
    ],
  },
];

export const aiKnowledgePillars = [
  {
    title: "发布手册",
    summary: "把一个自动化从概念推进到受监控上线的可复用流程清单。",
    freshness: "2 小时前更新",
    owner: "运营赋能",
    items: ["PRD 到提示词检查单", "回滚流程", "干系人同步模板"],
  },
  {
    title: "提示词系统",
    summary: "面向生产助手的标准提示词、评估量表和双语语气规范。",
    freshness: "48 分钟前同步",
    owner: "提示词小组",
    items: ["客服回复骨架", "提示词回归样例", "语气与翻译边界"],
  },
  {
    title: "信号库",
    summary: "直接服务决策质量的基准线、告警阈值和速读备忘录。",
    freshness: "今天早上已索引",
    owner: "洞察团队",
    items: ["延迟阈值", "升级热力规则", "周度学习归档"],
  },
];

export const aiSignals = [
  {
    title: "升级告警",
    value: "3",
    note: "都来自昨天更新后电商流程里缺失的兜底文案。",
  },
  {
    title: "评审缺口",
    value: "1 条泳道",
    note: "16:00 到 19:00 之间，待评审工作量明显高于可用评审时间。",
  },
  {
    title: "最新收益",
    value: "+12%",
    note: "双语回复评分器在最近一次挽回实验里提升了保留案例质量。",
  },
];

export const aiDecisionNotes = [
  {
    title: "下一步该标准化什么",
    summary: "在任务进入开发泳道前，把提示词评审备注和 QA 证据合并成统一包件。",
    badge: "决策备忘",
  },
  {
    title: "知识正在偏移的地方",
    summary: "还有两份合作方入门文档引用了旧版兜底逻辑，本周需要替换。",
    badge: "知识债务",
  },
  {
    title: "什么值得自动化",
    summary: "周度报告包的重复结构已经足够稳定，可以升级成半自动交付流程。",
    badge: "自动化候选",
  },
];

export const aiExperimentLog = [
  {
    name: "双语回复评分",
    result: "提升 12%",
    note: "面对中英混合工单时分辨率更高，人工重写次数更少。",
  },
  {
    name: "升级摘要生成器",
    result: "观察中",
    note: "摘要够短，但在高密度问题簇里仍会漏掉下一步负责人。",
  },
  {
    name: "知识优先路由",
    result: "提升 8%",
    note: "起草前先路由到正确手册，把平均处理时间压缩了 8%。",
  },
];

export const baleInboundStats = [
  { label: "打开中的运单", value: "12", meta: "其中 3 张总单仍需完成实物包裹确认" },
  { label: "入仓供应商明细", value: "84", meta: "覆盖最近 48 小时的海运与本地采购" },
  { label: "待打印标签", value: "158", meta: "主管确认后即可进入实物打印" },
  { label: "入仓总公斤数", value: "2,640", meta: "最近一次卸柜周期已在 4 月 15 日关闭" },
];

export const inboundOverview = [
  {
    ledger: "GOSUQ I N6862022-04152026",
    mode: "海运",
    stage: "包裹已确认",
    eta: "4月15日 14:30 已卸柜",
    cocItems: 17,
    totalBales: 50,
    pendingPrint: 32,
    suppliers: ["Youxun Demo", "Mazong", "Liyan Trading"],
  },
  {
    ledger: "KQ-LOC-04162026",
    mode: "本地采购",
    stage: "入仓进行中",
    eta: "4月16日 09:10 已到仓",
    cocItems: 6,
    totalBales: 14,
    pendingPrint: 4,
    suppliers: ["Nairobi Market West", "Kariokor Cut"],
  },
];

export const inboundRows = [
  {
    supplier: "Youxun Demo",
    segment: "裤装 / 工装裤",
    packages: 12,
    weight: 180,
    ledger: "GOSUQ I N6862022-04152026",
    printStatus: "待打印",
  },
  {
    supplier: "Mazong",
    segment: "裤装 / 卫裤",
    packages: 5,
    weight: 76,
    ledger: "GOSUQ I N6862022-04152026",
    printStatus: "已打印",
  },
  {
    supplier: "Nairobi Market West",
    segment: "上装 / 女装上衣",
    packages: 4,
    weight: 44,
    ledger: "KQ-LOC-04162026",
    printStatus: "待确认",
  },
  {
    supplier: "Liyan Trading",
    segment: "鞋类 / 运动鞋",
    packages: 8,
    weight: 129,
    ledger: "GOSUQ I N6862022-04152026",
    printStatus: "待打印",
  },
];

export const supplierSignals = [
  { supplier: "Youxun Demo", rows: 18, packages: 74, note: "今天海运未闭环里体量最大的供应商区块" },
  { supplier: "Mazong", rows: 9, packages: 28, note: "工装裤包裹需要优先释放打印" },
  { supplier: "Nairobi Market West", rows: 6, packages: 16, note: "本地采购确认更快，但总体量更小" },
];

export const printQueue = [
  {
    ledger: "GOSUQ I N6862022-04152026",
    segment: "裤装 / 工装裤",
    labels: 18,
    operator: "仓库主管",
  },
  {
    ledger: "GOSUQ I N6862022-04152026",
    segment: "裤装 / 卫裤",
    labels: 7,
    operator: "仓库主管",
  },
  {
    ledger: "KQ-LOC-04162026",
    segment: "上装 / 女装上衣",
    labels: 4,
    operator: "入仓文员",
  },
];

export const sortingStats = [
  { label: "排队中的分拣任务", value: "18", meta: "其中 7 个还在等主管释放" },
  { label: "分拣中的包裹", value: "126", meta: "覆盖 4 名主管和 12 名分拣员" },
  { label: "待上架确认", value: "29", meta: "入库过账前还需确认货架位" },
  { label: "今日已复核", value: "73", meta: "最近 8 小时内由主管确认的批次" },
];

export const sortingLanes = [
  {
    lane: "待分拣",
    count: 7,
    items: [
      {
        id: "ST-20260416-011",
        shipment: "GOSUQ I N6862022-04152026",
        segment: "裤装 / 工装裤",
        bales: 4,
        owner: "仓库主管",
      },
      {
        id: "ST-20260416-018",
        shipment: "KQ-LOC-04162026",
        segment: "上装 / 女装上衣",
        bales: 2,
        owner: "仓库主管",
      },
    ],
  },
  {
    lane: "待复核",
    count: 5,
    items: [
      {
        id: "ST-20260416-012",
        shipment: "GOSUQ I N6862022-04152026",
        segment: "裤装 / 卫裤",
        bales: 2,
        owner: "仓库主管",
      },
    ],
  },
  {
    lane: "待上架",
    count: 6,
    items: [
      {
        id: "ST-20260416-014",
        shipment: "GOSUQ I N6862022-04152026",
        segment: "外套 / 夹克",
        bales: 3,
        owner: "区域运营经理",
      },
    ],
  },
];

export const activeSortingTask = {
  id: "ST-20260416-011",
  shipment: "GOSUQ I N6862022-04152026",
  segment: "裤装 / 工装裤",
  owner: "仓库主管",
  notes: "分拣员先在线下纸面记数，主管逐包核对总数后再确认上架过账。",
  selectedBales: [
    "BALE-BL-20260416-YOUXUN-CARGOPAN-001-001",
    "BALE-BL-20260416-YOUXUN-CARGOPAN-001-002",
    "BALE-BL-20260416-YOUXUN-CARGOPAN-001-003",
    "BALE-BL-20260416-YOUXUN-CARGOPAN-001-004",
  ],
  checkpoints: [
    { label: "实物包裹数", value: "4/4 已完成" },
    { label: "纸面清单", value: "已收到" },
    { label: "目标货架", value: "WH-A-03-02" },
    { label: "差异", value: "0 件" },
  ],
};

export const sorterChecklist = [
  "必须先生成并贴好包裹标签，主管才能创建分拣任务。",
  "分拣员只在线下纸面记录数量，不直接在系统里确认库存。",
  "上架前由主管把纸面数量和实物包裹逐一核对。",
  "只有完成上架后，分拣库存才会真正进入库位库存。",
];

export const locationStats = [
  { label: "活跃货架区", value: "41", meta: "包含仓库、退仓区、拣货区和杂项区" },
  { label: "在架件数", value: "18,240", meta: "当前分拣后库存的在线总量" },
  { label: "待平衡热区", value: "7", meta: "这些区域填充率已超过 85%" },
  { label: "异常库位", value: "13", meta: "需要清理货架编码或重新分配" },
];

export const rackZones = [
  { zone: "WH-A", summary: "A 级服装区", fill: "82%", slots: "22 个库位中已占用 18 个" },
  { zone: "WH-B", summary: "B 级服装区", fill: "64%", slots: "22 个库位中已占用 14 个" },
  { zone: "WH-RET", summary: "退仓区", fill: "55%", slots: "16 个库位中已占用 9 个" },
  { zone: "WH-GEN", summary: "杂项区", fill: "71%", slots: "17 个库位中已占用 12 个" },
];

export const inventoryRows = [
  {
    rack: "WH-A-03-02-05",
    segment: "裤装 / 工装裤",
    quantity: 420,
    lastUpdate: "4月16日 17:42",
    lots: 4,
    status: "在线",
  },
  {
    rack: "WH-A-01-01-01",
    segment: "上装 / 女装上衣",
    quantity: 185,
    lastUpdate: "4月16日 16:15",
    lots: 2,
    status: "在线",
  },
  {
    rack: "WH-RET-01-02-02",
    segment: "鞋类 / 运动鞋",
    quantity: 74,
    lastUpdate: "4月16日 15:08",
    lots: 1,
    status: "待复核",
  },
  {
    rack: "WH-GEN-01-01-03",
    segment: "杂项 / 化妆品",
    quantity: 98,
    lastUpdate: "4月16日 14:22",
    lots: 3,
    status: "在线",
  },
];

export const locationAlerts = [
  { title: "WH-A-03-02-05 库位接近上限", detail: "工装裤分类已达到 82% 填充率，且还有 2 个待入仓批次。" },
  { title: "RET 区存在混级库存", detail: "下一批退仓过账前，需要先复查库位拆分。" },
  { title: "13 个库位标签待修正", detail: "实物贴纸与系统库位编码存在不一致。" },
];
