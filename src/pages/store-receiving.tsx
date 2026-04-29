import { AlertTriangle, ArrowLeft, CheckCircle2, PackageCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { cn } from "../lib/utils";


type PackageState = "pending" | "received" | "exception";
type SdoState = "pending" | "partial" | "completed" | "exception";

type SdoPackage = {
  id: string;
  category: string;
  quantity: string;
  sourceType: "现成包" | "补差包";
  sourceCode: string;
};

type SdoCard = {
  id: string;
  store: string;
  eta: string;
  packages: SdoPackage[];
};

const mockSdoCards: SdoCard[] = [
  {
    id: "SDO250429001",
    store: "Beyond ERP - 龙岗店",
    eta: "2026-04-29 14:20",
    packages: [
      { id: "p1", category: "女装夏季", quantity: "42 件", sourceType: "现成包", sourceCode: "SDB250429A01" },
      { id: "p2", category: "牛仔混包", quantity: "38 件", sourceType: "补差包", sourceCode: "LPK250429B03" },
    ],
  },
  {
    id: "SDO250429002",
    store: "Beyond ERP - 宝安店",
    eta: "2026-04-29 16:40",
    packages: [
      { id: "p1", category: "童装秋季", quantity: "31 件", sourceType: "现成包", sourceCode: "SDB250429A11" },
      { id: "p2", category: "外套补差", quantity: "14 件", sourceType: "补差包", sourceCode: "LPK250429B19" },
      { id: "p3", category: "配件", quantity: "20 件", sourceType: "现成包", sourceCode: "SDB250429A17" },
    ],
  },
];

const badgeText: Record<SdoState | PackageState, string> = {
  pending: "待验收",
  partial: "部分验收",
  completed: "已验收待分配",
  exception: "异常",
  received: "已收到",
};

export function StoreReceivingPage() {
  const [selectedSdoId, setSelectedSdoId] = useState<string | null>(null);
  const [packageStatusBySdo, setPackageStatusBySdo] = useState<Record<string, Record<string, PackageState>>>({});
  const [completedSdos, setCompletedSdos] = useState<Record<string, boolean>>({});

  const selectedSdo = mockSdoCards.find((sdo) => sdo.id === selectedSdoId) ?? null;

  const getPackageStatus = (sdoId: string, packageId: string): PackageState => {
    return packageStatusBySdo[sdoId]?.[packageId] ?? "pending";
  };

  const getSdoStatus = (sdo: SdoCard): SdoState => {
    const statuses = sdo.packages.map((pkg) => getPackageStatus(sdo.id, pkg.id));
    const hasException = statuses.includes("exception");
    const allPending = statuses.every((item) => item === "pending");
    const allHandled = statuses.every((item) => item !== "pending");

    if (completedSdos[sdo.id] && allHandled) {
      return "completed";
    }
    if (allPending) {
      return "pending";
    }
    if (hasException) {
      return allHandled ? "exception" : "partial";
    }
    return "partial";
  };

  const selectedHandledAll = useMemo(() => {
    if (!selectedSdo) return false;
    return selectedSdo.packages.every((pkg) => getPackageStatus(selectedSdo.id, pkg.id) !== "pending");
  }, [selectedSdo, packageStatusBySdo]);

  const markPackage = (sdoId: string, packageId: string, status: PackageState) => {
    setPackageStatusBySdo((prev) => ({
      ...prev,
      [sdoId]: {
        ...(prev[sdoId] ?? {}),
        [packageId]: status,
      },
    }));
  };

  const completeReceiving = () => {
    if (!selectedSdoId || !selectedHandledAll) return;
    setCompletedSdos((prev) => ({ ...prev, [selectedSdoId]: true }));
  };

  if (!selectedSdo) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Page 5 · 门店收货看板（SDO）</CardTitle>
            <CardDescription>点击开始验收后进入 Page 6，仅处理送货单包级状态。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {mockSdoCards.map((sdo) => {
              const sdoStatus = getSdoStatus(sdo);
              return (
                <article key={sdo.id} className="rounded-2xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#173238]">{sdo.id}</p>
                      <p className="mt-1 text-sm text-slate-500">{sdo.store}</p>
                      <p className="text-xs text-slate-400">预计到店：{sdo.eta}</p>
                    </div>
                    <Badge variant={sdoStatus === "completed" ? "success" : sdoStatus === "exception" ? "warning" : "info"}>
                      {badgeText[sdoStatus]}
                    </Badge>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-sm text-slate-600">共 {sdo.packages.length} 包</p>
                    <Button onClick={() => setSelectedSdoId(sdo.id)}>开始验收</Button>
                  </div>
                </article>
              );
            })}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Page 6 · 送货单验收明细</CardTitle>
              <CardDescription>仅在前端状态中记录每包是否已收到/异常，不触发旧 Bale 验收逻辑。</CardDescription>
            </div>
            <Button variant="outline" onClick={() => setSelectedSdoId(null)}>
              <ArrowLeft className="h-4 w-4" />
              返回看板
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border bg-[#f8fbfa] p-4">
            <p className="font-semibold text-[#173238]">{selectedSdo.id}</p>
            <p className="text-sm text-slate-500">{selectedSdo.store}</p>
          </div>

          {selectedSdo.packages.map((pkg, index) => {
            const status = getPackageStatus(selectedSdo.id, pkg.id);
            return (
              <article
                key={pkg.id}
                className={cn(
                  "rounded-2xl border p-4",
                  status === "received" && "border-emerald-300 bg-emerald-50/60",
                  status === "exception" && "border-amber-300 bg-amber-50/60",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#173238]">第 {index + 1} 包 / 共 {selectedSdo.packages.length} 包</p>
                    <p className="mt-1 text-sm text-slate-600">{pkg.category} · {pkg.quantity}</p>
                    <p className="mt-1 text-xs text-slate-400">{pkg.sourceType} · {pkg.sourceCode}（来源码，仅供核对）</p>
                  </div>
                  <Badge variant={status === "received" ? "success" : status === "exception" ? "warning" : "info"}>
                    {badgeText[status]}
                  </Badge>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <Button onClick={() => markPackage(selectedSdo.id, pkg.id, "received")} className="min-w-[140px]">
                    <PackageCheck className="h-4 w-4" />
                    确认收到此包
                  </Button>
                  <Button variant="outline" onClick={() => markPackage(selectedSdo.id, pkg.id, "exception")} className="min-w-[140px]">
                    <AlertTriangle className="h-4 w-4" />
                    上报异常
                  </Button>
                </div>
              </article>
            );
          })}

          <div className="rounded-2xl border p-4">
            <Button onClick={completeReceiving} disabled={!selectedHandledAll} className="min-w-[200px]">
              <CheckCircle2 className="h-4 w-4" />
              整单验收完成
            </Button>
            {completedSdos[selectedSdo.id] && (
              <p className="mt-3 text-sm text-emerald-700">本送货单已完成验收，下一步请进入店员分配。</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
