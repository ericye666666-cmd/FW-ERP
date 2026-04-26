import { MapPinned, PencilLine, Search } from "lucide-react";

import { StatCard } from "../components/stat-card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { inventoryRows, locationAlerts, locationStats, rackZones } from "../data/mock";

export function LocationInventoryPage() {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {locationStats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
        <div className="space-y-6">
          <Card className="border-[#dde5e2] bg-white/92">
            <CardHeader>
              <CardTitle className="text-[1.15rem] text-[#173238]">货架分区</CardTitle>
              <CardDescription>在钻进单个库位前，先从这里看每个仓库区域的容量概况。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {rackZones.map((zone) => (
                <div key={zone.zone} className="rounded-[24px] border border-[#e7eeeb] bg-[#fbfcfb] px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#173238]">{zone.zone}</p>
                      <p className="mt-1 text-sm text-slate-500">{zone.summary}</p>
                    </div>
                    <Badge variant={zone.fill === "82%" ? "warning" : "info"}>{zone.fill} 已占用</Badge>
                  </div>
                  <p className="mt-4 text-sm text-slate-500">{zone.slots}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-[#dde5e2] bg-white/92">
            <CardHeader>
              <CardTitle className="text-[1.15rem] text-[#173238]">需要处理</CardTitle>
              <CardDescription>这些作业提醒会影响货架决策和清理优先级。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {locationAlerts.map((alert) => (
                <div key={alert.title} className="rounded-[22px] border border-[#e7eeeb] bg-[#fbfcfb] px-4 py-4">
                  <p className="font-semibold text-[#173238]">{alert.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{alert.detail}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="border-[#dde5e2] bg-white/92">
          <CardHeader className="border-b border-[#edf1ef] pb-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle className="text-[1.35rem] text-[#173238]">库位库存</CardTitle>
                <CardDescription className="mt-2 text-[15px] leading-6 text-slate-500">
                  以货架为核心查看库存，并支持主管直接修改库位，完成最后一段修正。
                </CardDescription>
              </div>
              <div className="flex gap-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input className="w-[240px] pl-10" placeholder="搜索货架或品类" />
                </div>
                <Button variant="outline">
                  <MapPinned className="h-4 w-4" />
                  货架编辑器
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-hidden rounded-[24px] border border-[#e7eeeb]">
              <div className="grid grid-cols-[1.1fr_1fr_140px_160px_120px_auto] gap-4 border-b border-[#e7eeeb] bg-[#f7faf9] px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#688087]">
                <p>货架</p>
                <p>品类</p>
                <p>件数</p>
                <p>最后更新</p>
                <p>批次数</p>
                <p>状态</p>
              </div>
              <div className="divide-y divide-[#edf1ef] bg-white">
                {inventoryRows.map((row) => (
                  <div
                    key={`${row.rack}-${row.segment}`}
                    className="grid grid-cols-[1.1fr_1fr_140px_160px_120px_auto] gap-4 px-5 py-4 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-[#173238]">{row.rack}</p>
                      <button className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#eef4f2] px-3 py-1 text-xs font-medium text-[#31545c]">
                        <PencilLine className="h-3.5 w-3.5" />
                        编辑货架
                      </button>
                    </div>
                    <p className="font-medium text-slate-700">{row.segment}</p>
                    <p className="font-semibold text-[#173238]">{row.quantity}</p>
                    <p className="text-slate-500">{row.lastUpdate}</p>
                    <p className="font-medium text-[#173238]">{row.lots}</p>
                    <div>
                      <Badge variant={row.status === "待复核" ? "warning" : "success"}>{row.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
