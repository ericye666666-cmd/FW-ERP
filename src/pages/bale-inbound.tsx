import { ArrowRight, Printer, ScanSearch, ShipWheel } from "lucide-react";

import { StatCard } from "../components/stat-card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import {
  baleInboundStats,
  inboundOverview,
  inboundRows,
  printQueue,
  supplierSignals,
} from "../data/mock";

export function BaleInboundPage() {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {baleInboundStats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="border-[#dde5e2] bg-white/92">
          <CardHeader className="border-b border-[#edf1ef] pb-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle className="text-[1.45rem] text-[#173238]">运单总览</CardTitle>
                <CardDescription className="mt-2 text-[15px] leading-6 text-slate-500">
                  每一张总单代表一次主运单。这里把实物包裹确认、打印准备和供应商密度放在同一个视角里。
                </CardDescription>
              </div>
              <div className="flex gap-3">
                <Button variant="outline">查看 COC 记录</Button>
                <Button>新建入仓明细</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            {inboundOverview.map((ledger) => (
              <article
                key={ledger.ledger}
                className="rounded-[28px] border border-[#e5ece9] bg-[#fbfcfb] p-5 transition hover:border-[#cfd8d5] hover:bg-white"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#153d43] text-[#f6f0e5]">
                        <ShipWheel className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-base font-semibold text-[#173238]">{ledger.ledger}</p>
                        <p className="text-sm text-slate-500">{ledger.mode}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={ledger.stage === "包裹已确认" ? "success" : "warning"}>{ledger.stage}</Badge>
                      <Badge variant="default">{ledger.eta}</Badge>
                    </div>
                  </div>

                  <div className="grid min-w-[320px] gap-3 sm:grid-cols-3">
                    <MiniMetric label="COC 条目" value={String(ledger.cocItems)} />
                    <MiniMetric label="包裹总数" value={String(ledger.totalBales)} />
                    <MiniMetric label="待打印" value={String(ledger.pendingPrint)} />
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {ledger.suppliers.map((supplier) => (
                    <Badge key={supplier} className="bg-[#eef4f2] text-[#31545c]">
                      {supplier}
                    </Badge>
                  ))}
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Button variant="outline" size="sm">
                    打开包裹确认
                  </Button>
                  <Button size="sm">
                    进入标签打印
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </article>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="overflow-hidden border-[#dde5e2] bg-[#153d43] text-white">
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-white/65">实物打印队列</p>
                  <h3 className="mt-2 text-[2rem] font-semibold">32 张标签待打印</h3>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white/80">
                  <Printer className="h-6 w-6" />
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-white/72">
                已打印的实物标签要和数字生成记录分开管理，实际打印仍由仓库确认环节控制。
              </p>
            </CardContent>
          </Card>

          <Card className="border-[#dde5e2] bg-white/92">
            <CardHeader className="pb-4">
              <CardTitle className="text-[1.15rem] text-[#173238]">待打印队列</CardTitle>
              <CardDescription>等待实物条码打印的作业批次。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {printQueue.map((item) => (
                <div
                  key={`${item.ledger}-${item.segment}`}
                  className="flex items-center justify-between rounded-[22px] border border-[#e7eeeb] px-4 py-4"
                >
                  <div>
                    <p className="font-medium text-[#173238]">{item.segment}</p>
                    <p className="mt-1 text-sm text-slate-500">{item.ledger}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-[#173238]">{item.labels}</p>
                    <p className="text-sm text-slate-500">{item.operator}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-[#dde5e2] bg-white/92">
          <CardHeader className="border-b border-[#edf1ef] pb-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle className="text-[1.35rem] text-[#173238]">入仓明细</CardTitle>
                <CardDescription className="mt-2 text-[15px] leading-6 text-slate-500">
                  在同一张主运单下登记供应商维度的包裹明细，同时尽量不把系统噪音暴露给仓库操作员。
                </CardDescription>
              </div>
              <div className="flex gap-3">
                <Input className="w-[220px]" placeholder="搜索供应商或品类" />
                <Button variant="outline">
                  <ScanSearch className="h-4 w-4" />
                  筛选
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-hidden rounded-[24px] border border-[#e7eeeb]">
              <div className="grid grid-cols-[1.1fr_1fr_120px_120px_160px] gap-4 border-b border-[#e7eeeb] bg-[#f7faf9] px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#688087]">
                <p>供应商</p>
                <p>品类</p>
                <p>包数</p>
                <p>KG</p>
                <p>打印状态</p>
              </div>
              <div className="divide-y divide-[#edf1ef] bg-white">
                {inboundRows.map((row) => (
                  <div
                    key={`${row.ledger}-${row.supplier}-${row.segment}`}
                    className="grid grid-cols-[1.1fr_1fr_120px_120px_160px] gap-4 px-5 py-4 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-[#173238]">{row.supplier}</p>
                      <p className="mt-1 text-slate-500">{row.ledger}</p>
                    </div>
                    <p className="font-medium text-slate-700">{row.segment}</p>
                    <p className="font-semibold text-[#173238]">{row.packages}</p>
                    <p className="font-semibold text-[#173238]">{row.weight}</p>
                    <div>
                      <Badge
                        variant={
                          row.printStatus === "已打印"
                            ? "success"
                            : row.printStatus === "待打印"
                              ? "warning"
                              : "default"
                        }
                      >
                        {row.printStatus}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-[#dde5e2] bg-white/92">
            <CardHeader>
              <CardTitle className="text-[1.15rem] text-[#173238]">供应商集中度</CardTitle>
              <CardDescription>看清哪些供应商区块最值得优先复核和释放打印。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {supplierSignals.map((supplier) => (
                <div key={supplier.supplier} className="rounded-[22px] border border-[#e7eeeb] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-[#173238]">{supplier.supplier}</p>
                    <Badge variant="default">{supplier.rows} 行</Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{supplier.note}</p>
                  <p className="mt-3 text-sm font-medium text-[#173238]">当前打开中的入仓共有 {supplier.packages} 包</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-[#dde5e2] bg-white/92">
            <CardHeader>
              <CardTitle className="text-[1.15rem] text-[#173238]">快速录入</CardTitle>
              <CardDescription>给现有运单快速追加新的入仓明细。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Select
                  defaultValue="GOSUQ"
                  options={[
                    { value: "GOSUQ", label: "GOSUQ I N6862022-04152026" },
                    { value: "KQ", label: "KQ-LOC-04162026" },
                  ]}
                />
                <Select
                  defaultValue="pants"
                  options={[
                    { value: "pants", label: "裤装 / 工装裤" },
                    { value: "tops", label: "上装 / 女装上衣" },
                  ]}
                />
                <Input defaultValue="Youxun Demo" />
                <Input defaultValue="12 包 · 180 公斤" />
              </div>
              <Button className="w-full">新增入仓明细</Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-[#e7eeeb] bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#72878d]">{label}</p>
      <p className="mt-2 text-lg font-semibold text-[#173238]">{value}</p>
    </div>
  );
}
