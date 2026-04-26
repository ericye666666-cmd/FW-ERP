import { CheckCheck, ListFilter, ScanSearch } from "lucide-react";

import { StatCard } from "../components/stat-card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { activeSortingTask, sorterChecklist, sortingLanes, sortingStats } from "../data/mock";

export function SortingTasksPage() {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {sortingStats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-[#dde5e2] bg-white/92">
          <CardHeader className="border-b border-[#edf1ef] pb-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle className="text-[1.35rem] text-[#173238]">分拣泳道</CardTitle>
                <CardDescription className="mt-2 text-[15px] leading-6 text-slate-500">
                  这里只展示主管持有的任务。分拣员仍在线下纸面作业，系统只追踪挑包和上架确认。
                </CardDescription>
              </div>
              <div className="flex gap-3">
                <Button variant="outline">
                  <ListFilter className="h-4 w-4" />
                  筛选任务
                </Button>
                <Button>新建任务</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 pt-6 xl:grid-cols-3">
            {sortingLanes.map((lane) => (
              <div key={lane.lane} className="rounded-[28px] border border-[#e7eeeb] bg-[#fbfcfb] p-4">
                <div className="flex items-center justify-between gap-3 border-b border-[#edf1ef] pb-4">
                  <div>
                    <p className="font-semibold text-[#173238]">{lane.lane}</p>
                    <p className="mt-1 text-sm text-slate-500">本泳道共 {lane.count} 个任务</p>
                  </div>
                  <Badge variant={lane.lane === "待复核" ? "warning" : lane.lane === "待上架" ? "success" : "info"}>
                    {lane.count}
                  </Badge>
                </div>
                <div className="mt-4 space-y-3">
                  {lane.items.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      className="w-full rounded-[22px] border border-[#e7eeeb] bg-white px-4 py-4 text-left transition hover:border-[#cfd8d5]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[#173238]">{task.id}</p>
                          <p className="mt-1 text-sm text-slate-500">{task.segment}</p>
                        </div>
                        <Badge variant="default">{task.bales} 包</Badge>
                      </div>
                      <p className="mt-3 text-sm text-slate-500">{task.shipment}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[#779096]">{task.owner}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="overflow-hidden border-[#dde5e2] bg-[#153d43] text-white">
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-white/68">当前选中任务</p>
                  <h3 className="mt-2 text-[1.9rem] font-semibold">{activeSortingTask.id}</h3>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white/80">
                  <CheckCheck className="h-6 w-6" />
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-white/72">{activeSortingTask.notes}</p>
            </CardContent>
          </Card>

          <Card className="border-[#dde5e2] bg-white/92">
            <CardHeader>
              <CardTitle className="text-[1.15rem] text-[#173238]">任务详情</CardTitle>
              <CardDescription>展示已挑包裹、复核检查点和目标货架，供主管确认。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {activeSortingTask.checkpoints.map((checkpoint) => (
                  <div key={checkpoint.label} className="rounded-[22px] border border-[#e7eeeb] bg-[#f9fbfa] px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a9094]">{checkpoint.label}</p>
                    <p className="mt-2 text-sm font-semibold text-[#173238]">{checkpoint.value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-[24px] border border-[#e7eeeb] p-4">
                <div className="flex items-center gap-2">
                  <ScanSearch className="h-4 w-4 text-slate-400" />
                  <p className="text-sm font-semibold text-[#173238]">已挑包裹</p>
                </div>
                <div className="mt-4 space-y-2">
                  {activeSortingTask.selectedBales.map((bale) => (
                    <div key={bale} className="rounded-2xl bg-[#f7faf9] px-4 py-3 text-sm font-medium text-[#173238]">
                      {bale}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button variant="outline">查看已挑包裹</Button>
                <Button>确认上架</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#dde5e2] bg-white/92">
            <CardHeader>
              <CardTitle className="text-[1.15rem] text-[#173238]">主管检查单</CardTitle>
              <CardDescription>确保纸面优先的分拣流程和系统过账保持一致。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {sorterChecklist.map((item) => (
                <div key={item} className="rounded-[22px] border border-[#e7eeeb] bg-[#fbfcfb] px-4 py-4 text-sm leading-6 text-slate-600">
                  {item}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
