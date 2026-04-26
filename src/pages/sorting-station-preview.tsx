import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronDown,
  Clock3,
  LayoutPanelTop,
  PlayCircle,
  ScanLine,
  Search,
  ShieldAlert,
  UserRound,
  Warehouse,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { cn } from "../lib/utils";

const shellSections = [
  {
    title: "仓库执行",
    items: [
      { label: "分拣任务工位", active: true },
      { label: "包裹入仓工作面" },
      { label: "库位调整工作面" },
    ],
  },
  {
    title: "支持区",
    items: [{ label: "异常处理" }, { label: "交接记录" }, { label: "打印与回执" }],
  },
];

const queueItems = [
  {
    id: "ST-240421-07",
    status: "待主管复核",
    owner: "Amina",
    bales: "18 包",
    stage: "当前选中",
    time: "17:40 前",
    selected: true,
  },
  {
    id: "ST-240421-05",
    status: "待释放下工位",
    owner: "Kevin",
    bales: "12 包",
    stage: "并行排队",
    time: "18:10 前",
  },
  {
    id: "ST-240421-03",
    status: "待补扫尾包裹",
    owner: "Rose",
    bales: "09 包",
    stage: "并行排队",
    time: "18:25 前",
  },
  {
    id: "ST-240421-02",
    status: "待主管确认异常",
    owner: "Noah",
    bales: "06 包",
    stage: "异常挂起",
    time: "18:50 前",
  },
];

const workbenchSteps = [
  {
    step: "01",
    title: "纸面统计已核对",
    detail: "A/B 类汇总与散件数量已对齐，当前不需要回退到任务创建。",
    state: "done",
  },
  {
    step: "02",
    title: "补扫尾包裹",
    detail: "剩余 4 包需要补扫。这个区域只保留当前动作相关信息，不展示支持页内容。",
    state: "active",
  },
  {
    step: "03",
    title: "释放到确认入库",
    detail: "确认扫尾完成后，主管执行唯一主动作，把任务释放到下一工位。",
    state: "upcoming",
  },
];

const selectedBales = [
  {
    bale: "WB-07-014",
    source: "GOSUQ / 女装上衣",
    position: "A2 复核台",
    note: "高价值件待补备注",
    status: "关注",
  },
  {
    bale: "WB-07-015",
    source: "GOSUQ / 工装裤",
    position: "A2 复核台",
    note: "数量一致",
    status: "正常",
  },
  {
    bale: "WB-07-016",
    source: "YOUXUN / 混包",
    position: "A2 复核台",
    note: "待二次扫描",
    status: "处理中",
  },
  {
    bale: "WB-07-017",
    source: "YOUXUN / 女装裙装",
    position: "A2 复核台",
    note: "数量一致",
    status: "正常",
  },
];

const alertItems = [
  {
    title: "高价值件备注未补齐",
    detail: "2 包仍缺人工备注。异常区保留提醒，但不抢主工作面的主动作位置。",
    tone: "danger",
  },
  {
    title: "纸面与扫描差异 1 项",
    detail: "已被识别，主管可在释放前复核，不需要回到任务建单页。",
    tone: "warning",
  },
];

const nextActions = [
  { label: "当前工位", value: "A2 分拣复核台" },
  { label: "当前动作", value: "补扫尾包裹 04 包" },
  { label: "下一工位", value: "0.2 分拣确认入库" },
  { label: "责任人", value: "主管 Amina / 扫描 Kevin" },
];

export function SortingStationPreviewPage() {
  return (
    <div className="fiori-station-preview min-h-screen">
      <header className="fiori-shell sticky top-0 z-30 border-x-0 border-t-0">
        <div className="flex h-14 items-center gap-4 px-5">
          <div className="flex min-w-[250px] items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--fiori-blue-soft)] text-[var(--fiori-blue)]">
              <Warehouse className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--fiori-title)]">Retail Ops ERP</p>
              <p className="truncate text-xs text-[var(--fiori-muted)]">Warehouse Sorting Workbench</p>
            </div>
          </div>

          <div className="relative hidden max-w-[520px] flex-1 lg:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fiori-muted)]" />
            <Input
              className="h-9 rounded-lg border-[var(--fiori-border)] bg-[var(--fiori-surface-raised)] pl-9 shadow-none"
              placeholder="搜索任务号、包号、工位或供应商"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button className="rounded-lg border border-[var(--fiori-border)] bg-[var(--fiori-surface-raised)] px-3 py-2 text-sm text-[var(--fiori-title)]">
              Kenya WH01
            </button>
            <button className="rounded-lg border border-[var(--fiori-border)] bg-[var(--fiori-surface-raised)] p-2 text-[var(--fiori-muted)]">
              <Bell className="h-4 w-4" />
            </button>
            <button className="flex items-center gap-2 rounded-lg border border-[var(--fiori-border)] bg-[var(--fiori-surface)] px-3 py-2 text-sm text-[var(--fiori-title)]">
              <UserRound className="h-4 w-4 text-[var(--fiori-muted)]" />
              admin_1
              <ChevronDown className="h-4 w-4 text-[var(--fiori-muted)]" />
            </button>
          </div>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-3.5rem)] grid-cols-[264px_minmax(0,1fr)]">
        <aside className="border-r border-[var(--fiori-border)] bg-[#fbfcfd] px-4 py-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--fiori-title)]">系统导航</p>
              <p className="text-xs text-[var(--fiori-muted)]">按角色和工位显示</p>
            </div>
            <LayoutPanelTop className="h-4 w-4 text-[var(--fiori-muted)]" />
          </div>

          <div className="space-y-5">
            {shellSections.map((section) => (
              <section key={section.title}>
                <p className="mb-2 px-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--fiori-muted)]">
                  {section.title}
                </p>
                <div className="space-y-1">
                  {section.items.map((item) => (
                    <button
                      key={item.label}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                        item.active
                          ? "bg-[var(--fiori-blue-soft)] font-semibold text-[var(--fiori-blue)]"
                          : "text-[var(--fiori-title)] hover:bg-[var(--fiori-surface)]",
                      )}
                    >
                      <span>{item.label}</span>
                      {item.active ? <PlayCircle className="h-4 w-4" /> : null}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="fiori-panel mt-6 rounded-xl px-4 py-4">
            <p className="fiori-section-label">样稿说明</p>
            <p className="mt-2 text-sm leading-6 text-[var(--fiori-muted)]">
              这页刻意把支持页后退，只让“当前状态、当前动作、下一步”成为页面主轴。
            </p>
            <Link
              to="/sorting-tasks"
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--fiori-blue)]"
            >
              <ArrowLeft className="h-4 w-4" />
              返回原版分拣任务页
            </Link>
          </div>
        </aside>

        <main className="px-6 py-5">
          <section className="fiori-panel rounded-[1rem] px-5 py-5">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <p className="fiori-section-label">Warehouse / Sorting Supervision / Station Workbench</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <h1 className="text-[1.9rem] font-semibold tracking-[-0.03em] text-[var(--fiori-title)]">
                    分拣任务工位台
                  </h1>
                  <ObjectStatus tone="info">待主管复核</ObjectStatus>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[var(--fiori-muted)]">
                  <span>当前工位: A2 分拣复核台</span>
                  <span>主管: Amina</span>
                  <span>班次: 早班</span>
                  <span>SLA 剩余: 42 分钟</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  className="h-9 rounded-lg border border-[#0b74de] bg-[var(--fiori-blue)] px-4 text-white hover:bg-[#0a63c7]"
                >
                  完成复核并释放
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-lg border-[var(--fiori-border)] px-4 text-[var(--fiori-title)] shadow-none"
                >
                  打开异常处理
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 rounded-lg px-3 text-[var(--fiori-muted)] hover:bg-[var(--fiori-surface-raised)]"
                >
                  打印交接单
                </Button>
              </div>
            </div>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
            <aside className="space-y-4">
              <section className="fiori-panel rounded-[1rem] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="fiori-section-label">任务队列</p>
                    <h2 className="mt-1 text-lg font-semibold text-[var(--fiori-title)]">并行任务</h2>
                  </div>
                  <button className="rounded-lg border border-[var(--fiori-border)] bg-[var(--fiori-surface-raised)] p-2 text-[var(--fiori-muted)]">
                    <Search className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  {queueItems.map((item) => (
                    <article
                      key={item.id}
                      className={cn(
                        "rounded-xl border px-4 py-3",
                        item.selected
                          ? "border-[var(--fiori-border-strong)] bg-[var(--fiori-surface-selected)]"
                          : "border-[var(--fiori-border)] bg-[var(--fiori-surface-raised)]",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[var(--fiori-title)]">{item.id}</p>
                          <p className="mt-1 text-sm text-[var(--fiori-muted)]">{item.status}</p>
                        </div>
                        <ObjectStatus tone={item.selected ? "info" : "neutral"}>{item.bales}</ObjectStatus>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                        <span className="text-[var(--fiori-muted)]">{item.owner}</span>
                        <span className="font-semibold text-[var(--fiori-title)]">{item.time}</span>
                      </div>
                      <div className="mt-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--fiori-muted)]">
                        {item.stage}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </aside>

            <section className="space-y-4">
              <section className="fiori-panel rounded-[1rem] px-5 py-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ObjectStatus tone="info" icon={<ScanLine className="h-3.5 w-3.5" />}>
                        当前动作
                      </ObjectStatus>
                      <ObjectStatus tone="positive" icon={<Clock3 className="h-3.5 w-3.5" />}>
                        17:40 前释放
                      </ObjectStatus>
                    </div>
                    <h2 className="mt-3 text-[1.4rem] font-semibold tracking-[-0.02em] text-[var(--fiori-title)]">
                      当前任务工作面
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-[var(--fiori-muted)]">
                      当前页只服务主管完成手上这一单任务。支持信息后退到右栏，不再和主工作面同权竞争。
                    </p>
                  </div>

                  <div className="fiori-muted-panel rounded-xl px-4 py-3 text-sm text-[var(--fiori-muted)]">
                    任务号 <span className="font-semibold text-[var(--fiori-title)]">ST-240421-07</span>
                    <span className="mx-2 text-[#a0adb8]">|</span>
                    本批 <span className="font-semibold text-[var(--fiori-title)]">18 包</span>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 lg:grid-cols-3">
                  {workbenchSteps.map((step) => (
                    <article
                      key={step.step}
                      className={cn(
                        "rounded-xl border px-4 py-4",
                        step.state === "active" && "border-[var(--fiori-border-strong)] bg-[var(--fiori-surface-selected)]",
                        step.state === "done" && "border-[var(--fiori-border)] bg-[var(--fiori-surface-raised)]",
                        step.state === "upcoming" && "border-dashed border-[var(--fiori-border)] bg-white",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                            step.state === "done" && "bg-[var(--fiori-positive-soft)] text-[var(--fiori-positive)]",
                            step.state === "active" && "bg-[var(--fiori-blue)] text-white",
                            step.state === "upcoming" && "bg-[var(--fiori-surface-raised)] text-[var(--fiori-muted)]",
                          )}
                        >
                          {step.step}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-[var(--fiori-title)]">{step.title}</p>
                            <ObjectStatus
                              tone={
                                step.state === "done" ? "positive" : step.state === "active" ? "info" : "neutral"
                              }
                            >
                              {step.state === "done" ? "已完成" : step.state === "active" ? "进行中" : "待执行"}
                            </ObjectStatus>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-[var(--fiori-muted)]">{step.detail}</p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="fiori-panel rounded-[1rem] px-5 py-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="fiori-section-label">包裹明细</p>
                    <h2 className="mt-1 text-lg font-semibold text-[var(--fiori-title)]">已绑定包裹清单</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-lg border-[var(--fiori-border)] px-4 text-[var(--fiori-title)] shadow-none"
                    >
                      搜索包号
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 rounded-lg px-3 text-[var(--fiori-muted)] hover:bg-[var(--fiori-surface-raised)]"
                    >
                      筛选异常
                    </Button>
                  </div>
                </div>

                <div className="fiori-table mt-4">
                  <div className="fiori-table-header grid grid-cols-[1fr_1.15fr_0.85fr_1fr_0.8fr] gap-3 px-4 py-3">
                    <p>包号</p>
                    <p>来源批次</p>
                    <p>当前工位</p>
                    <p>备注</p>
                    <p>状态</p>
                  </div>
                  <div className="divide-y divide-[var(--fiori-border)]">
                    {selectedBales.map((bale) => (
                      <div
                        key={bale.bale}
                        className={cn(
                          "grid grid-cols-[1fr_1.15fr_0.85fr_1fr_0.8fr] gap-3 px-4 py-4 text-sm",
                          bale.status === "关注" && "bg-[var(--fiori-warning-soft)]",
                        )}
                      >
                        <p className="font-semibold text-[var(--fiori-title)]">{bale.bale}</p>
                        <p className="text-[var(--fiori-muted)]">{bale.source}</p>
                        <p className="text-[var(--fiori-muted)]">{bale.position}</p>
                        <p className="text-[var(--fiori-title)]">{bale.note}</p>
                        <div>
                          <ObjectStatus tone={baleTone(bale.status)}>{bale.status}</ObjectStatus>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </section>

            <aside className="space-y-4">
              <section className="fiori-panel rounded-[1rem] px-4 py-4">
                <p className="fiori-section-label">异常与支持</p>
                <h2 className="mt-1 text-lg font-semibold text-[var(--fiori-title)]">异常区</h2>
                <div className="mt-4 space-y-3">
                  {alertItems.map((item) => (
                    <article
                      key={item.title}
                      className={cn(
                        "rounded-xl border px-4 py-4",
                        item.tone === "danger"
                          ? "border-[#f0c9c9] bg-[var(--fiori-danger-soft)]"
                          : "border-[#f1d39a] bg-[var(--fiori-warning-soft)]",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "mt-0.5",
                            item.tone === "danger" ? "text-[var(--fiori-danger)]" : "text-[var(--fiori-warning)]",
                          )}
                        >
                          {item.tone === "danger" ? (
                            <ShieldAlert className="h-4 w-4" />
                          ) : (
                            <AlertTriangle className="h-4 w-4" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-[var(--fiori-title)]">{item.title}</p>
                          <p className="mt-2 text-sm leading-6 text-[var(--fiori-muted)]">{item.detail}</p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="fiori-panel rounded-[1rem] px-4 py-4">
                <p className="fiori-section-label">下一步与交接</p>
                <h2 className="mt-1 text-lg font-semibold text-[var(--fiori-title)]">工位摘要</h2>
                <div className="mt-4 space-y-2">
                  {nextActions.map((item) => (
                    <div key={item.label} className="fiori-muted-panel flex items-center justify-between rounded-xl px-4 py-3">
                      <span className="text-sm text-[var(--fiori-muted)]">{item.label}</span>
                      <span className="text-sm font-semibold text-[var(--fiori-title)]">{item.value}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-[var(--fiori-border-strong)] bg-[var(--fiori-blue-soft)] px-4 py-4">
                  <p className="fiori-section-label text-[var(--fiori-blue)]">唯一主动作</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--fiori-title)]">
                    完成扫尾后直接释放到确认入库。打印、帮助、历史记录只做辅操作，不抢主按钮。
                  </p>
                  <Button
                    size="sm"
                    className="mt-4 h-9 rounded-lg border border-[#0b74de] bg-[var(--fiori-blue)] px-4 text-white hover:bg-[#0a63c7]"
                  >
                    完成复核并释放
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </section>

              <section className="fiori-panel rounded-[1rem] px-4 py-4">
                <p className="fiori-section-label">样稿特征</p>
                <div className="mt-3 space-y-3">
                  <SampleNote>
                    这页先给主管 `任务队列 + 当前任务 + 异常支持`，而不是先铺一堆统计卡。
                  </SampleNote>
                  <SampleNote>主工作面是表格和步骤，不是展示型内容块，这才更像 ERP。</SampleNote>
                  <SampleNote>主动作固定、次动作收敛，页面的权重分配更像真实工位。</SampleNote>
                </div>
              </section>
            </aside>
          </section>
        </main>
      </div>
    </div>
  );
}

function ObjectStatus({
  children,
  tone,
  icon,
}: {
  children: ReactNode;
  tone: "neutral" | "info" | "positive" | "warning" | "danger";
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "fiori-status",
        tone === "neutral" && "bg-[var(--fiori-surface-raised)] text-[var(--fiori-muted)]",
        tone === "info" && "bg-[var(--fiori-blue-soft)] text-[var(--fiori-blue)]",
        tone === "positive" && "bg-[var(--fiori-positive-soft)] text-[var(--fiori-positive)]",
        tone === "warning" && "bg-[var(--fiori-warning-soft)] text-[var(--fiori-warning)]",
        tone === "danger" && "bg-[var(--fiori-danger-soft)] text-[var(--fiori-danger)]",
      )}
    >
      {icon}
      {children}
    </span>
  );
}

function SampleNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-[var(--fiori-surface-raised)] px-4 py-4">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--fiori-positive)]" />
      <p className="text-sm leading-6 text-[var(--fiori-title)]">{children}</p>
    </div>
  );
}

function baleTone(status: string): "warning" | "positive" | "info" {
  if (status === "关注") {
    return "warning";
  }

  if (status === "处理中") {
    return "info";
  }

  return "positive";
}
